// /opt/tma-mvp/web/app/lucky-winner/main.go
package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"math/rand"
	"net/smtp"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	DB *pgxpool.Pool
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
		api.POST("/verify/send", s.VerifySend)
		api.POST("/verify/check", s.VerifyCheck)

		// Защищённые эндпойнты — требуют Bearer JWT
		auth := api.Group("/")
		auth.Use(AuthRequired())
		auth.GET("/profile", s.ProfileProtected)
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

// --- /api/verify/send PUBLIC (отправка кода)
func (s *Server) VerifySend(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "Invalid email"})
		return
	}

	// Dummy tg_id = 1 (MVP)
	tgID := int64(1)

	// Генерация 6-значного кода
	code := rand.Intn(900000) + 100000
	codeStr := fmt.Sprintf("%06d", code)
	hash := codeStr // MVP: без хэширования
	expires := time.Now().Add(5 * time.Minute)
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

	// Сохраняем новый OTP
	_, err = s.DB.Exec(c, `
		INSERT INTO otp (user_id, email, code_hash, sent_at, expires_at, resend_after)
		VALUES ($1, $2, $3, NOW(), $4, $5)
	`, userID, req.Email, hash, expires, resendAfter)
	if err != nil {
		log.Printf("OTP save error: %v", err)
		c.JSON(500, gin.H{"error": "Send error"})
		return
	}

	// Отправляем письмо
	if err := s.sendEmail(req.Email, codeStr); err != nil {
		log.Printf("Email send error: %v", err)
		c.JSON(500, gin.H{"error": "Send error"})
		return
	}

	c.JSON(200, gin.H{"sent": true, "resend_in": 30})
}

// --- Реальная отправка email (SMTP Mail.ru/465 TLS)
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

	// Dummy tg_id = 1 (MVP)
	tgID := int64(1)

	var userID int64
	if err := s.DB.QueryRow(c, "SELECT id FROM users WHERE tg_id = $1", tgID).Scan(&userID); err != nil {
		log.Printf("User ID fetch error for tg_id %d: %v", tgID, err)
		c.JSON(404, gin.H{"error": "User not found"})
		return
	}

	// Достаём актуальный OTP
	var hash string
	err := s.DB.QueryRow(c, `
		SELECT code_hash
		FROM otp
		WHERE user_id = $1
		  AND email   = $2
		  AND expires_at > NOW()
	`, userID, req.Email).Scan(&hash)
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
	_, _ = s.DB.Exec(c, "DELETE FROM otp WHERE user_id = $1 AND email = $2", userID, req.Email)
	_, _ = s.DB.Exec(c, "UPDATE users SET email = $1, email_verified_at = NOW() WHERE id = $2", req.Email, userID)

	// ⚠️ JWT выдаёт функция из auth.go
	token, err := IssueAccessToken(userID)
	if err != nil {
		log.Printf("JWT issue error: %v", err)
		c.JSON(500, gin.H{"error": "token error"})
		return
	}

	log.Printf("Verification success for email %s", req.Email)
	c.JSON(200, gin.H{"token": token, "verified": true})
}
