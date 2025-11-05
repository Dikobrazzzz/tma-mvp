// /opt/tma-mvp/api/main.go
package main

import (
        "strconv"
	"database/sql"
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
        "net/http"
	"net/smtp"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	DB *pgxpool.Pool
}

func normalizeEmail(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

// helper: границы дат по табу (UTC)
func dateBoundsForRange(r string) (time.Time, time.Time) {
	now := time.Now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	switch r {
	case "today":
		return today, today.AddDate(0, 0, 1)
	case "yesterday":
		y := today.AddDate(0, 0, -1)
		return y, today
	case "last7":
		start := today.AddDate(0, 0, -6) // 7 дней включая сегодня
		return start, today.AddDate(0, 0, 1)
	case "top10":
		// последние 30 дней
		start := today.AddDate(0, 0, -29)
		return start, today.AddDate(0, 0, 1)
	default:
		return today, today.AddDate(0, 0, 1)
	}
}

func main() {
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		panic(err)
	}
	defer pool.Close()

	// миграции: users.balance + wallet_ledger (+ winners extras)
	if err := runMigrations(ctx, pool); err != nil {
		log.Fatalf("migrations failed: %v", err)
	}

	s := &Server{DB: pool}

	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())
	_ = r.SetTrustedProxies(nil)

	api := r.Group("/api")
	{
		// Публичные (без JWT)
		api.GET("/gate", s.GatePublic)
		api.GET("/user", s.UserPublic)
		api.POST("/auth/exists", s.AuthExists)
		api.POST("/verify/send", s.VerifySend)
		api.POST("/verify/check", s.VerifyCheck)
		api.POST("/auth/refresh", s.Refresh)          // предполагается реализованным где-то в коде
		api.GET("/winners/latest", s.WinnersLatest)
		api.POST("/auth/tg-init", s.TgInitLogin)      // предполагается реализованным где-то в коде
 		api.GET("/winners", s.WinnersAgg)             // NEW: агрегаты для Winners.jsx
                api.POST("/auth/logout", s.Logout)

		// Защищённые — требуется Bearer JWT (твоя реализация AuthRequired)
		auth := api.Group("/")
		auth.Use(AuthRequired()) // предполагается реализованным где-то в коде
		auth.GET("/profile", s.ProfileProtected)
		auth.GET("/winners/my", s.WinnersMy)

		// профиль + баланс + флаг модалки
		auth.GET("/me", s.MeProtected)
		// ACK показа ClaimDenied
		auth.POST("/claim-denied-ack", s.ClaimDeniedAck)
		// начисление бонуса в кошелёк
		auth.POST("/claim-bonus", s.ClaimBonus)
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

// --- MIGRATIONS: users.balance + wallet_ledger (+ winners extras) -------------

func runMigrations(ctx context.Context, db *pgxpool.Pool) error {
	// 1) users.balance
	if _, err := db.Exec(ctx, `
		ALTER TABLE IF EXISTS users
		ADD COLUMN IF NOT EXISTS balance NUMERIC(12,2) NOT NULL DEFAULT 0
	`); err != nil {
		return fmt.Errorf("add users.balance: %w", err)
	}

	// 2) wallet_ledger — история операций по балансу
	if _, err := db.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS wallet_ledger (
			id          BIGSERIAL PRIMARY KEY,
			user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			amount_eur  NUMERIC(12,2) NOT NULL,
			reason      TEXT,
			created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
		);
		CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created
			ON wallet_ledger (user_id, created_at DESC);
	`); err != nil {
		return fmt.Errorf("create wallet_ledger: %w", err)
	}

	// 3) не критично: индекс для claim_denied_oneoff (если таблица есть)
	if _, err := db.Exec(ctx, `
		DO $$
		BEGIN
			IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
					   WHERE n.nspname='public' AND c.relname='claim_denied_oneoff') THEN
				IF NOT EXISTS (
					SELECT 1 FROM pg_indexes
					WHERE schemaname='public' AND indexname='idx_claim_denied_oneoff_user_email'
				) THEN
					CREATE INDEX idx_claim_denied_oneoff_user_email
						ON claim_denied_oneoff (user_id, email_norm, shown_at);
				END IF;
			END IF;
		END $$;
	`); err != nil {
		log.Printf("optional index on claim_denied_oneoff: %v", err)
	}

	// 4) winners: claimed_at + индекс по email_norm
	if _, err := db.Exec(ctx, `
		ALTER TABLE IF EXISTS public.lw_winners
		  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
		CREATE INDEX IF NOT EXISTS lw_winners_email_idx
		  ON public.lw_winners(email_norm);
	`); err != nil {
		return fmt.Errorf("winners extras: %w", err)
	}

	return nil
}

// --- PUBLIC ------------------------------------------------------------------

func (s *Server) GatePublic(c *gin.Context) {
	c.JSON(200, gin.H{"blocked": false, "seconds_left": 0})
	// last_seen (MVP tg_id=1)
	_, err := s.DB.Exec(c, `
		INSERT INTO users(tg_id) VALUES(1)
		ON CONFLICT (tg_id) DO UPDATE SET last_seen_at = NOW()
	`)
	if err != nil {
		log.Printf("DB log error: %v", err)
	}
}

func (s *Server) UserPublic(c *gin.Context) {
	c.JSON(200, gin.H{"tg_id": 1})
}

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

	// email в белом списке
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

	// MVP: tg_id=1, создаём пользователя при необходимости
	tgID := int64(1)
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

	// OTP
	code := rand.Intn(900000) + 100000
	codeStr := fmt.Sprintf("%06d", code)
	hash := codeStr // MVP
	expires := time.Now().Add(30 * time.Minute)
	resendAfter := time.Now().Add(30 * time.Second)

	_, _ = s.DB.Exec(c, "DELETE FROM otp WHERE user_id = $1", userID)
	_, err = s.DB.Exec(c, `
		INSERT INTO otp (user_id, email, code_hash, sent_at, expires_at, resend_after)
		VALUES ($1, $2, $3, NOW(), $4, $5)
	`, userID, email, hash, expires, resendAfter)
	if err != nil {
		log.Printf("OTP save error: %v", err)
		c.JSON(500, gin.H{"error": "Send error"})
		return
	}

	if err := s.sendEmail(email, codeStr); err != nil {
		log.Printf("Email send error: %v", err)
		c.JSON(500, gin.H{"error": "Send error"})
		return
	}
	c.JSON(200, gin.H{"sent": true, "resend_in": 30})
}

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

	// MVP
	tgID := int64(1)
	var userID int64
	if err := s.DB.QueryRow(c, "SELECT id FROM users WHERE tg_id = $1", tgID).Scan(&userID); err != nil {
		log.Printf("User ID fetch error for tg_id %d: %v", tgID, err)
		c.JSON(404, gin.H{"error": "User not found"})
		return
	}

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
	if hash != req.Code {
		log.Printf("Invalid code: stored %s, received %s", hash, req.Code)
		c.JSON(400, gin.H{"error": "Invalid code"})
		return
	}

	_, _ = s.DB.Exec(c, "DELETE FROM otp WHERE user_id = $1 AND email = $2", userID, email)
	_, _ = s.DB.Exec(c, "UPDATE users SET email = $1, email_verified_at = NOW() WHERE id = $2", email, userID)

	token, err := IssueAccessToken(userID) // предполагается реализованным где-то в коде
	if err != nil {
		log.Printf("JWT issue error: %v", err)
		c.JSON(500, gin.H{"error": "token error"})
		return
	}

	rt, exp, err := IssueRefreshToken(userID) // предполагается реализованным где-то в коде
	if err == nil {
		setRefreshCookie(c, rt, exp) // предполагается реализованным где-то в коде
	}

	log.Printf("Verification success for email %s", email)
	c.JSON(200, gin.H{"token": token, "verified": true})
}

// SMTP
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

// --- PROTECTED ------------------------------------------------------

func (s *Server) ProfileProtected(c *gin.Context) {
	uidAny, _ := c.Get("user_id")
	userID, ok := uidAny.(int64)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}

	var email *string
	var emailVerified bool
	if err := s.DB.QueryRow(c, `
		SELECT email, email_verified_at IS NOT NULL
		FROM users
		WHERE id = $1
	`, userID).Scan(&email, &emailVerified); err != nil {
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

// PUBLIC
func (s *Server) WinnersLatest(c *gin.Context) {
	drawID := c.Query("draw_id")
	if drawID == "" {
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

// helper: завершённые дни (UTC)
func completedBoundsForRange(rng string, now time.Time) (time.Time, time.Time) {
    // нормализуем к полуночи UTC
    todayUTC := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0,0,0,0, time.UTC)
    switch rng {
    case "today":
        // показываем вчерашний день
        return todayUTC.AddDate(0,0,-1), todayUTC
    case "yesterday":
        // позавчера
        return todayUTC.AddDate(0,0,-2), todayUTC.AddDate(0,0,-1)
    case "last7":
        // последние 7 завершённых дней, включая вчера (7*25 = 175 строк при без-агрегационном выводе)
        return todayUTC.AddDate(0,0,-7), todayUTC
    case "top10":
        // тот же интервал, что и last7
        return todayUTC.AddDate(0,0,-7), todayUTC
    default:
        // дефолт — как last7
        return todayUTC.AddDate(0,0,-7), todayUTC
    }
}


// NEW: агрегаты для страницы Winners (today|yesterday|last7|top10)
func (s *Server) WinnersAgg(c *gin.Context) {
	rng := c.Query("range")
	from, to := completedBoundsForRange(rng, time.Now())

	const q = `
	  SELECT
	    email_norm,
	    COUNT(*)::int                         AS win_count,
	    COALESCE(SUM(amount_eur),0)::float8   AS win_amount,
	    BOOL_OR(claimed_at IS NOT NULL)       AS claimed
	  FROM public.lw_winners
	  WHERE draw_id >= $1::date::text
	    AND draw_id <  $2::date::text
	  GROUP BY email_norm
	  ORDER BY win_amount DESC
	  LIMIT 200;
	`

	rows, err := s.DB.Query(c, q,
		from.Format("2006-01-02"),
		to.Format("2006-01-02"),
	)
	if err != nil {
		c.JSON(500, gin.H{"error": "db error"})
		return
	}
	defer rows.Close()

	type Row struct {
		EmailNorm string  `json:"email_norm"`
		WinCount  int     `json:"win_count"`
		WinAmount float64 `json:"win_amount"`
		Claimed   bool    `json:"claimed"`
	}

	list := make([]Row, 0, 64)
	for rows.Next() {
		var r Row
		if err := rows.Scan(&r.EmailNorm, &r.WinCount, &r.WinAmount, &r.Claimed); err != nil {
			c.JSON(500, gin.H{"error": "scan error"})
			return
		}
		list = append(list, r)
	}
	c.JSON(200, list)
}

func (s *Server) MeProtected(c *gin.Context) {
	uidAny, _ := c.Get("user_id")
	userID, ok := uidAny.(int64)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}

	// 1) базовые поля из users
	var email *string
	var emailVerified bool
	var balance float64
	if err := s.DB.QueryRow(c, `
		SELECT email, email_verified_at IS NOT NULL, COALESCE(balance, 0)
		FROM users
		WHERE id = $1
	`, userID).Scan(&email, &emailVerified, &balance); err != nil {
		log.Printf("me fetch error: %v", err)
		c.JSON(500, gin.H{"error": "db error"})
		return
	}

	emailTxt := ""
	if email != nil {
		emailTxt = *email
	}

	// 2) внешние ID из выгрузок по email (нормализуем к lower)
	var ledgerUserID sql.NullInt64
	var authUserID sql.NullInt64

	if emailTxt != "" {
		// lw_ledger: берём MAX(user_id), игнорируем 0 как «нет данных»
		if err := s.DB.QueryRow(c, `
			SELECT NULLIF(MAX(l.user_id), 0)::bigint
			FROM lw_ledger l
			WHERE l.email_norm = lower($1)::citext
		`, emailTxt).Scan(&ledgerUserID); err != nil {
			log.Printf("me ledger id error: %v", err)
		}

		// auth_emails: аналогично
		if err := s.DB.QueryRow(c, `
			SELECT NULLIF(MAX(a.user_id), 0)::bigint
			FROM auth_emails a
			WHERE a.email_norm = lower($1)::citext
		`, emailTxt).Scan(&authUserID); err != nil {
			log.Printf("me auth id error: %v", err)
		}
	}

	// 3) флаг для one-off баннера
	var shouldShow bool
	if err := s.DB.QueryRow(c, `
		SELECT EXISTS (
		  SELECT 1
		  FROM claim_denied_oneoff t
		  WHERE t.shown_at IS NULL
		    AND (
		          t.user_id = $1
		       OR ($2 <> '' AND t.email_norm = lower($2)::citext)
		    )
		)
	`, userID, emailTxt).Scan(&shouldShow); err != nil {
		log.Printf("target check error: %v", err)
		c.JSON(500, gin.H{"error": "db error"})
		return
	}

	// 4) формируем ответ; null-инты отдаём как число или null
	var ledgerPtr *int64
	if ledgerUserID.Valid {
		v := ledgerUserID.Int64
		ledgerPtr = &v
	}
	var authPtr *int64
	if authUserID.Valid {
		v := authUserID.Int64
		authPtr = &v
	}

	c.JSON(200, gin.H{
		"user_id":                  userID, // внутренний users.id (fallback)
		"email":                    email,
		"email_verified":           emailVerified,
		"balance":                  balance,
		"should_show_claim_denied": shouldShow,

		// добавлено:
		"ledger_user_id": ledgerPtr, // AccountID из lw_ledger (или null)
		"auth_user_id":   authPtr,   // user_id из auth_emails (или null)
		"external_id":    nil,       // на будущее, если появится внешний источник
	})
}

// POST /api/claim-denied-ack — помечает показанным
func (s *Server) ClaimDeniedAck(c *gin.Context) {
	uidAny, _ := c.Get("user_id")
	userID, ok := uidAny.(int64)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}

	var email *string
	_ = s.DB.QueryRow(c, `SELECT email FROM users WHERE id = $1`, userID).Scan(&email)

	emailTxt := ""
	if email != nil {
		emailTxt = *email
	}

	_, err := s.DB.Exec(c, `
		UPDATE claim_denied_oneoff
		   SET shown_at = NOW()
		 WHERE shown_at IS NULL
		   AND (
			 user_id = $1
		  OR ($2 <> '' AND email_norm = $2)
		   )
	`, userID, emailTxt)
	if err != nil {
		log.Printf("claim-denied-ack update error: %v", err)
		c.JSON(500, gin.H{"ok": false})
		return
	}
	c.JSON(200, gin.H{"ok": true})
}

// POST /api/claim-bonus { amount: 500, reason: "claim_denied_bonus" }
func (s *Server) ClaimBonus(c *gin.Context) {
        uidAny, _ := c.Get("user_id")
        userID, ok := uidAny.(int64)
        if !ok {
                c.JSON(401, gin.H{"error": "unauthorized"})
                return
        }
        var req struct {
                Amount float64 `json:"amount"`
                Reason string `json:"reason"`
        }
        if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
                c.JSON(400, gin.H{"error": "bad request"})
                return
        }
        if req.Amount <= 0 {
                c.JSON(400, gin.H{"error": "amount must be > 0"})
                return
        }
        if req.Reason == "" {
                req.Reason = "bonus"
        }
        ctx := c.Request.Context()
        tx, err := s.DB.BeginTx(ctx, pgx.TxOptions{})
        if err != nil {
                c.JSON(500, gin.H{"error": "tx begin error"})
                return
        }
        defer func() { _ = tx.Rollback(ctx) }()
        // журнал + обновить баланс (всегда, без проверки exists)
        log.Printf("ClaimBonus: adding bonus for user %d, amount %.2f, reason %s", userID, req.Amount, req.Reason)
        if _, err := tx.Exec(ctx, `
                INSERT INTO wallet_ledger(user_id, amount_eur, reason)
                VALUES($1, $2, $3)
        `, userID, req.Amount, req.Reason); err != nil {
                c.JSON(500, gin.H{"error": "insert ledger error"})
                return
        }
        if _, err := tx.Exec(ctx, `
                UPDATE users SET balance = COALESCE(balance,0) + $1
                WHERE id = $2
        `, req.Amount, userID); err != nil {
                c.JSON(500, gin.H{"error": "update balance error"})
                return
        }
        var newBal float64
        if err := tx.QueryRow(ctx, `SELECT COALESCE(balance,0) FROM users WHERE id=$1`, userID).Scan(&newBal); err != nil {
                c.JSON(500, gin.H{"error": "get balance error"})
                return
        }
        // 🔔 уведомление боту (уйдёт после успешного COMMIT этой транзакции)
        payload := map[string]any{
                "event": "claim_bonus",
                "user_id": userID,
                "amount_eur": req.Amount,
                "reason": req.Reason,
                "ts": time.Now().UTC(), // import "time"
        }
        b, _ := json.Marshal(payload)
        log.Printf("Preparing notify with payload: %s", string(b))
        if _, err := tx.Exec(ctx, `SELECT pg_notify('lw_winner_events', $1)`, string(b)); err != nil {
                log.Printf("pg_notify error: %v", err)
                c.JSON(500, gin.H{"error": "notify error"})
                return
        }
        log.Printf("pg_notify sent successfully")
        if err := tx.Commit(ctx); err != nil {
                c.JSON(500, gin.H{"error": "tx commit error"})
                return
        }
        c.JSON(200, gin.H{"new_balance": newBal})
}

// GET /api/winners_feed?range=today|yesterday|last7&limit=50
func (s *Server) WinnersFeed(c *gin.Context) {
    rng := c.Query("range")
    from, to := completedBoundsForRange(rng, time.Now())

    // лимит с безопасными границами
    lim := 175
    if v := c.Query("limit"); v != "" {
        if n, err := strconv.Atoi(v); err == nil {
            if n < 1 {
                n = 1
            }
            if n > 500 {
                n = 500
            }
            lim = n
        }
    }

    const q = `
      SELECT
        draw_id,
        email_norm,
        user_id,
        amount_eur,
        (claimed_at IS NOT NULL) AS claimed
      FROM public.lw_winners
      WHERE draw_id >= $1::date::text
        AND draw_id <  $2::date::text
      ORDER BY draw_id, amount_eur DESC, email_norm
      LIMIT $3
    `

    rows, err := s.DB.Query(c, q, from.Format("2006-01-02"), to.Format("2006-01-02"), lim)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": "db error"})
        return
    }
    defer rows.Close()

    type Row struct {
        DrawID    string  `json:"draw_id"`
        EmailNorm string  `json:"email_norm"`
        UserID    *int64  `json:"user_id"`     // nullable
        Amount    float64 `json:"amount_eur"`
        Claimed   bool    `json:"claimed"`
    }

    list := make([]Row, 0, lim)
    for rows.Next() {
        var (
            drawID, email string
            uid sql.NullInt64
            amount float64
            claimed bool
        )
        if err := rows.Scan(&drawID, &email, &uid, &amount, &claimed); err != nil {
            c.JSON(http.StatusInternalServerError, gin.H{"error": "scan error"})
            return
        }
        var userPtr *int64
        if uid.Valid {
            v := uid.Int64
            userPtr = &v
        }
        list = append(list, Row{
            DrawID:    drawID,
            EmailNorm: email,
            UserID:    userPtr,
            Amount:    amount,
            Claimed:   claimed,
        })
    }
    c.JSON(http.StatusOK, list)
}


// GET /api/winners_top10  (топ-10 по сумме за last7 completed)
func (s *Server) WinnersTop10(c *gin.Context) {
    from, to := completedBoundsForRange("top10", time.Now())
    const q = `
      SELECT
        email_norm,
        COUNT(*)::int                       AS win_count,
        COALESCE(SUM(amount_eur),0)::float8 AS win_amount,
        BOOL_OR(claimed_at IS NOT NULL)     AS claimed
      FROM public.lw_winners
      WHERE draw_id >= $1::date::text
        AND draw_id <  $2::date::text
      GROUP BY email_norm
      ORDER BY win_amount DESC
      LIMIT 10;
    `
    rows, err := s.DB.Query(c, q, from.Format("2006-01-02"), to.Format("2006-01-02"))
    if err != nil { c.JSON(500, gin.H{"error":"db error"}); return }
    defer rows.Close()

    type Row struct {
        EmailNorm string  `json:"email_norm"`
        WinCount  int     `json:"win_count"`
        WinAmount float64 `json:"win_amount"`
        Claimed   bool    `json:"claimed"`
    }
    list := make([]Row,0,10)
    for rows.Next() {
        var r Row
        if err := rows.Scan(&r.EmailNorm, &r.WinCount, &r.WinAmount, &r.Claimed); err != nil {
            c.JSON(500, gin.H{"error":"scan error"}); return
        }
        list = append(list, r)
    }
    c.JSON(200, list)
}
