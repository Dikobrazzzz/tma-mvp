// /opt/tma-mvp/api/main.go
package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"math/rand"
	"net/smtp"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	DB *pgxpool.Pool
}

func normalizeEmail(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func main() {
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		panic(err)
	}
	defer pool.Close()

	s := &Server{DB: pool}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	_ = r.SetTrustedProxies(nil)

	api := r.Group("/api")
	{
		// Публичные эндпойнты (без JWT)
		api.GET("/gate", s.GatePublic)
		api.GET("/user", s.UserPublic)

		// пред-проверка e-mail в БД
		api.POST("/auth/exists", s.AuthExists)

		// OTP
		api.POST("/verify/send", s.VerifySend)
		api.POST("/verify/check", s.VerifyCheck)

		// публичный список победителей последнего розыгрыша (или по draw_id)
		api.GET("/winners/latest", s.WinnersLatest)

		// Защищённые эндпойнты — требуют Bearer JWT
		auth := api.Group("/")
		auth.Use(AuthRequired())
		auth.GET("/profile", s.ProfileProtected)
		// мои выигрыши
		auth.GET("/winners/my", s.WinnersMy)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Starting server on port %s", port)
	if err := r.Run(":" + port); err != nil {
		panic(err)
	}
}

// --- /api/gate PUBLIC (всегда open)
func (s *Server) GatePublic(c *gin.Context) {
	c.JSON(200, gin.H{"blocked": false, "seconds_left": 0})

	// Логируем last_seen (dummy tg_id = 1 для MVP)
	_, err := s.DB.Exec(c, `
		INSERT INTO users(tg_id) VALUES(1)
		ON CONFLICT (tg_id) DO UPDATE SET last_seen_at = NOW()
	`)
	if err != nil {
		log.Printf("DB log error: %v", err)
	}
}

// --- /api/user PUBLIC (dummy)
func (s *Server) UserPublic(c *gin.Context) {
	c.JSON(200, gin.H{"tg_id": 1})
}

// --- /api/profile PROTECTED (нужен JWT)
func (s *Server) ProfileProtected(c *gin.Context) {
	uidAny, _ := c.Get("user_id")
	userID, ok := uidAny.(int64)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}

	var email *string
	var emailVerified bool
	err := s.DB.QueryRow(c, `
		SELECT email, email_verified_at IS NOT NULL
		FROM users
		WHERE id = $1
	`, userID).Scan(&email, &emailVerified)
	if err != nil {
		log.Printf("profile fetch error: %v", err)
		c.JSON(500, gin.H{"error": "db error"})
		return
	}

	c.JSON(200, gin.H{
		"user_id":         userID,
		"email":           email,
		"email_verified":  emailVerified,
		"wins_count":      0,
		"wins_amount_usd": 0,
	})
}

// --- /api/auth/exists PUBLIC (пред-проверка в auth_emails)
func (s *Server) AuthExists(c *gin.Context) {
	var req struct {
		Email string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"exists": false, "error": "bad request"})
		return
	}
	email := normalizeEmail(req.Email)
	if email == "" {
		c.JSON(200, gin.H{"exists": false})
		return
	}

	var exists bool
	if err := s.DB.QueryRow(c,
		`SELECT EXISTS(SELECT 1 FROM auth_emails WHERE email_norm = $1)`,
		email,
	).Scan(&exists); err != nil {
		log.Printf("auth.exists db error: %v", err)
		c.JSON(500, gin.H{"exists": false, "error": "db error"})
		return
	}

	c.JSON(200, gin.H{"exists": exists})
}

// --- /api/verify/send PUBLIC (отправка кода; шлём только если e-mail разрешён)
func (s *Server) VerifySend(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
	 c.JSON(400, gin.H{"error": "Invalid email"})
	 return
	}
	email := normalizeEmail(req.Email)
	if email == "" {
	 c.JSON(400, gin.H{"error": "Invalid email"})
	 return
	}

	// Проверка наличия email в auth_emails
	var allowed bool
	if err := s.DB.QueryRow(c,
		`SELECT EXISTS(SELECT 1 FROM auth_emails WHERE email_norm = $1)`,
		email,
	).Scan(&allowed); err != nil {
		log.Printf("verify.send exists error: %v", err)
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	if !allowed {
		c.JSON(403, gin.H{"error": "Email is not allowed"})
		return
	}

	// Dummy tg_id = 1 (MVP)
	tgID := int64(1)

	// Генерация 6-значного кода
	code := rand.Intn(900000) + 100000
	codeStr := fmt.Sprintf("%06d", code)
	hash := codeStr // MVP: без хэширования
	expires := time.Now().Add(30 * time.Minute) // 30 минут валидности (как на фронте)
	resendAfter := time.Now().Add(30 * time.Second)

	// Получаем/создаём пользователя
	var userID int64
	err := s.DB.QueryRow(c, "SELECT id FROM users WHERE tg_id = $1", tgID).Scan(&userID)
	if err != nil {
		_, err = s.DB.Exec(c, "INSERT INTO users (tg_id) VALUES ($1)", tgID)
		if err != nil {
			c.JSON(500, gin.H{"error": "DB error"})
			return
		}
		err = s.DB.QueryRow(c, "SELECT id FROM users WHERE tg_id = $1", tgID).Scan(&userID)
		if err != nil {
			c.JSON(500, gin.H{"error": "DB error"})
			return
		}
	}

	// Удаляем старые OTP
	_, _ = s.DB.Exec(c, "DELETE FROM otp WHERE user_id = $1", userID)

	// Сохраняем новый OTP (храним нормализованный email)
	_, err = s.DB.Exec(c, `
		INSERT INTO otp (user_id, email, code_hash, sent_at, expires_at, resend_after)
		VALUES ($1, $2, $3, NOW(), $4, $5)
	`, userID, email, hash, expires, resendAfter)
	if err != nil {
		log.Printf("OTP save error: %v", err)
		c.JSON(500, gin.H{"error": "Send error"})
		return
	}

	// Отправляем письмо
	if err := s.sendEmail(email, codeStr); err != nil {
		log.Printf("Email send error: %v", err)
		c.JSON(500, gin.H{"error": "Send error"})
		return
	}

	c.JSON(200, gin.H{"sent": true, "resend_in": 30})
}

// --- /api/verify/check PUBLIC (возвращает JWT)
func (s *Server) VerifyCheck(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
		Code  string `json:"code"  binding:"required,len=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		log.Printf("Bind JSON error: %v", err)
		c.JSON(400, gin.H{"error": "Invalid input"})
		return
	}
	email := normalizeEmail(req.Email)
	if email == "" {
		c.JSON(400, gin.H{"error": "Invalid input"})
		return
	}

	// Dummy tg_id = 1 (MVP)
	tgID := int64(1)

	var userID int64
	if err := s.DB.QueryRow(c, "SELECT id FROM users WHERE tg_id = $1", tgID).Scan(&userID); err != nil {
		log.Printf("User ID fetch error for tg_id %d: %v", tgID, err)
		c.JSON(404, gin.H{"error": "User not found"})
		return
	}

	// Достаём актуальный OTP по нормализованной почте
	var hash string
	err := s.DB.QueryRow(c, `
		SELECT code_hash
		FROM otp
		WHERE user_id = $1
		  AND email   = $2
		  AND expires_at > NOW()
	`, userID, email).Scan(&hash)
	if err != nil {
		log.Printf("OTP fetch error: %v", err)
		c.JSON(400, gin.H{"error": "Invalid or expired code"})
		return
	}

	// Сверяем код (MVP: прямое сравнение)
	if hash != req.Code {
		log.Printf("Invalid code: stored %s, received %s", hash, req.Code)
		c.JSON(400, gin.H{"error": "Invalid code"})
		return
	}

	// Удаляем использованный OTP и отмечаем верификацию email
	_, _ = s.DB.Exec(c, "DELETE FROM otp WHERE user_id = $1 AND email = $2", userID, email)
	_, _ = s.DB.Exec(c, "UPDATE users SET email = $1, email_verified_at = NOW() WHERE id = $2", email, userID)

	// JWT
	token, err := IssueAccessToken(userID)
	if err != nil {
		log.Printf("JWT issue error: %v", err)
		c.JSON(500, gin.H{"error": "token error"})
		return
	}

	log.Printf("Verification success for email %s", email)
	c.JSON(200, gin.H{"token": token, "verified": true})
}

// --- SMTP helper
func (s *Server) sendEmail(to, code string) error {
	from := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	smtpHost := os.Getenv("SMTP_HOST")
	smtpPort := os.Getenv("SMTP_PORT")

	if from == "" || pass == "" || smtpHost == "" || smtpPort == "" {
		return fmt.Errorf("SMTP env vars not set")
	}

	msg := []byte("To: " + to + "\r\n" +
		"Subject: Your OTP Code\r\n" +
		"\r\nYour verification code is: " + code + "\r\n")

	auth := smtp.PlainAuth("", from, pass, smtpHost)
	addr := smtpHost + ":" + smtpPort
	tlsConfig := &tls.Config{ServerName: smtpHost}

	conn, err := tls.Dial("tcp", addr, tlsConfig)
	if err != nil {
		return err
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, smtpHost)
	if err != nil {
		return err
	}
	defer client.Close()

	if err = client.Auth(auth); err != nil {
		return err
	}
	if err = client.Mail(from); err != nil {
		return err
	}
	if err = client.Rcpt(to); err != nil {
		return err
	}
	w, err := client.Data()
	if err != nil {
		return err
	}
	if _, err = w.Write(msg); err != nil {
		return err
	}
	if err = w.Close(); err != nil {
		return err
	}
	return client.Quit()
}

// --- /api/winners/my (JWT)
func (s *Server) WinnersMy(c *gin.Context) {
	uidAny, _ := c.Get("user_id")
	userID, ok := uidAny.(int64)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}

	rows, err := s.DB.Query(c, `
		SELECT draw_id, amount_eur, rank, reason, computed_at
		FROM lw_winners
		WHERE user_id = $1
		ORDER BY computed_at DESC, rank ASC
		LIMIT 200
	`, userID)
	if err != nil {
		c.JSON(500, gin.H{"error": "db error"})
		return
	}
	defer rows.Close()

	type Win struct {
		DrawID     string    `json:"draw_id"`
		AmountEUR  float64   `json:"amount_eur"`
		Rank       int       `json:"rank"`
		Reason     string    `json:"reason"`
		ComputedAt time.Time `json:"computed_at"`
	}
	wins := []Win{}
	for rows.Next() {
		var w Win
		if err := rows.Scan(&w.DrawID, &w.AmountEUR, &w.Rank, &w.Reason, &w.ComputedAt); err != nil {
			c.JSON(500, gin.H{"error": "scan error"})
			return
		}
		wins = append(wins, w)
	}
	c.JSON(200, gin.H{"winnings": wins})
}

// --- /api/winners/latest (PUBLIC)
func (s *Server) WinnersLatest(c *gin.Context) {
	drawID := c.Query("draw_id")
	if drawID == "" {
		// если не передали — берём последний по времени расчёта
		_ = s.DB.QueryRow(c, `SELECT draw_id FROM lw_winners ORDER BY computed_at DESC LIMIT 1`).Scan(&drawID)
		if drawID == "" {
			c.JSON(200, gin.H{"draw_id": "", "winners": []any{}})
			return
		}
	}

	rows, err := s.DB.Query(c, `
		SELECT email_norm, amount_eur, rank
		FROM lw_winners
		WHERE draw_id = $1
		ORDER BY rank ASC
		LIMIT 1000
	`, drawID)
	if err != nil {
		c.JSON(500, gin.H{"error": "db error"})
		return
	}
	defer rows.Close()

	type W struct {
		Email  string  `json:"email"`
		Amount float64 `json:"amount_eur"`
		Rank   int     `json:"rank"`
	}
	list := []W{}
	for rows.Next() {
		var w W
		if err := rows.Scan(&w.Email, &w.Amount, &w.Rank); err != nil {
			c.JSON(500, gin.H{"error": "scan error"})
			return
		}
		list = append(list, w)
	}
	c.JSON(200, gin.H{"draw_id": drawID, "winners": list})
}
