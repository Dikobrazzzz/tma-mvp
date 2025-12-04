package main

import (
	"bytes"
	"context"
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Server struct {
	DB *pgxpool.Pool
}

func normalizeEmail(s string) string { return strings.ToLower(strings.TrimSpace(s)) }

// --- date helpers ------------------------------------------------------------

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
		start := today.AddDate(0, 0, -6)
		return start, today.AddDate(0, 0, 1)
	case "top10":
		start := today.AddDate(0, 0, -29)
		return start, today.AddDate(0, 0, 1)
	default:
		return today, today.AddDate(0, 0, 1)
	}
}

func completedBoundsForRange(rng string, now time.Time) (time.Time, time.Time) {
	todayUTC := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0, 0, 0, 0, time.UTC)
	switch rng {
	case "today":
		return todayUTC.AddDate(0, 0, -1), todayUTC
	case "yesterday":
		return todayUTC.AddDate(0, 0, -2), todayUTC.AddDate(0, 0, -1)
	case "last7":
		return todayUTC.AddDate(0, 0, -7), todayUTC
	case "top10":
		return todayUTC.AddDate(0, 0, -7), todayUTC
	default:
		return todayUTC.AddDate(0, 0, -7), todayUTC
	}
}

// --- Customer.io webhook -----------------------------------------------------

// CUSTOMERIO_WEBHOOK_URL=https://api-eu.customer.io/v1/webhook/642341dc8683d16c
const customerIoWebhookEnv = "CUSTOMERIO_WEBHOOK_URL"

type CustomerIoPayload struct {
	Email        string  `json:"email"`
	UserID       int64   `json:"user_id"`
	RewardAmount float64 `json:"reward_amount"`
	DrawID       string  `json:"draw_id"`
	ClaimedAt    string  `json:"claimed_at"` // RFC3339
	EventName    string  `json:"event_name"`
}

func sendCustomerIoBonus(ctx context.Context, payload CustomerIoPayload) error {
	url := os.Getenv(customerIoWebhookEnv)
	if url == "" {
		// В проде лучше залогировать warning, но не ронять логику
		log.Printf("customer.io: %s is not set, skipping webhook", customerIoWebhookEnv)
		return nil
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("customer.io: marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("customer.io: new request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("customer.io: do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("customer.io: non-2xx status: %s", resp.Status)
	}

	return nil
}

// --- main --------------------------------------------------------------------

func main() {
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, os.Getenv("DATABASE_URL"))
	if err != nil {
		panic(err)
	}
	defer pool.Close()

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
		// Публичные
		api.GET("/gate", s.GatePublic)
		api.GET("/user", s.UserPublic)

		api.POST("/auth/exists", s.AuthExists)
		api.POST("/verify/send", s.VerifySend)
		api.POST("/verify/check", s.VerifyCheck)
		api.POST("/analytics/email-not-found", s.EmailNotFoundShown)
		api.POST("/analytics/track", s.AnalyticsTrack)
		api.POST("/analytics/batch", s.AnalyticsBatch)

		api.GET("/ui-progress", s.UIProgress)

		// уже есть в твоих файлах
		api.POST("/auth/tg-init", s.TgInitLogin)
		api.POST("/auth/refresh", s.Refresh)
		api.POST("/auth/logout", s.Logout)

		api.GET("/winners/latest", s.WinnersLatest)
		api.GET("/winners", s.WinnersAgg)

		// Защищённые
		auth := api.Group("/")
		auth.Use(AuthRequired()) // из твоего auth.go
		auth.GET("/profile", s.ProfileProtected)

		auth.GET("/me", s.MeProtected)
		auth.GET("/winners/my", s.WinnersMy)
		auth.POST("/winners/claim", s.WinnersClaim)

		auth.POST("/claim-denied-ack", s.ClaimDeniedAck)
		auth.POST("/claim-bonus", s.ClaimBonus)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Starting server on :%s", port)
	if err := r.Run(":" + port); err != nil {
		panic(err)
	}
}

// --- migrations --------------------------------------------------------------

func runMigrations(ctx context.Context, db *pgxpool.Pool) error {
	// winners extras + индексы
	if _, err := db.Exec(ctx, `
                ALTER TABLE IF EXISTS public.lw_winners
                  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
                CREATE INDEX IF NOT EXISTS lw_winners_email_comp_rank
                  ON public.lw_winners (email_norm, computed_at DESC, rank ASC);
                CREATE INDEX IF NOT EXISTS lw_winners_email_claimed_null
                  ON public.lw_winners (email_norm) WHERE claimed_at IS NULL;
        `); err != nil {
		return fmt.Errorf("winners extras: %w", err)
	}

	// одноразовый флаг показа модалки (по email_norm)
	if _, err := db.Exec(ctx, `
                CREATE TABLE IF NOT EXISTS claim_denied_oneoff (
                        email_norm CITEXT PRIMARY KEY,
                        shown_at   TIMESTAMPTZ
                );
        `); err != nil {
		return fmt.Errorf("claim_denied_oneoff: %w", err)
	}

	// safety: users.balance (если пригодится)
	if _, err := db.Exec(ctx, `
                ALTER TABLE IF EXISTS users
                ADD COLUMN IF NOT EXISTS balance NUMERIC(12,2) NOT NULL DEFAULT 0
        `); err != nil {
		return fmt.Errorf("users.balance: %w", err)
	}

	// аналитика логинов/модалок
	if _, err := db.Exec(ctx, `
          CREATE TABLE IF NOT EXISTS auth_login_events (
            id          bigserial PRIMARY KEY,
            ts          timestamptz NOT NULL DEFAULT now(),
            email_norm  citext      NOT NULL,
            user_id     bigint,
            event_type  text        NOT NULL, -- 'login_ok' | 'email_not_found_modal' | 'email_check_not_allowed' | 'otp_send_ok' | 'otp_send_fail'
            source      text,                 -- 'tma', 'web', 'api', ...
            ip          inet,
            user_agent  text,
            extra       jsonb       NOT NULL DEFAULT '{}'::jsonb
          );

          CREATE INDEX IF NOT EXISTS ale_ts_idx        ON auth_login_events (ts DESC);
          CREATE INDEX IF NOT EXISTS ale_email_idx     ON auth_login_events (email_norm);
          CREATE INDEX IF NOT EXISTS ale_type_idx      ON auth_login_events (event_type);
          CREATE INDEX IF NOT EXISTS ale_email_type_ts ON auth_login_events (email_norm, event_type, ts DESC);
        `); err != nil {
		return fmt.Errorf("auth_login_events: %w", err)
	}

	// дневной прогресс UI: кумулятивный банк до 5000 €
	if _, err := db.Exec(ctx, `
          CREATE TABLE IF NOT EXISTS public.ui_progress (
            draw_id    date PRIMARY KEY,
            amount_eur numeric(12,2) NOT NULL DEFAULT 0,
            updated_at timestamptz   NOT NULL DEFAULT now()
          );

          -- защитный триггер-кап (на случай ручных апдейтов)
          CREATE OR REPLACE FUNCTION public.ui_progress_cap()
          RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.amount_eur > 5000 THEN NEW.amount_eur := 5000; END IF;
            IF NEW.amount_eur < 0   THEN NEW.amount_eur := 0;   END IF;
            RETURN NEW;
          END$$;

          DROP TRIGGER IF EXISTS ui_progress_cap_trg ON public.ui_progress;
          CREATE TRIGGER ui_progress_cap_trg
          BEFORE INSERT OR UPDATE ON public.ui_progress
          FOR EACH ROW EXECUTE FUNCTION public.ui_progress_cap();
        `); err != nil {
		return fmt.Errorf("ui_progress: %w", err)
	}

	// аналитика событий пользователей (визиты, клики, навигация)
	if _, err := db.Exec(ctx, `
          CREATE TABLE IF NOT EXISTS analytics_events (
            id            bigserial PRIMARY KEY,
            ts            timestamptz NOT NULL DEFAULT now(),
            session_id    text        NOT NULL,
            event_type    text        NOT NULL,  -- 'page_view' | 'button_click' | 'navigation' | 'session_start' | 'session_end'
            page          text,                   -- текущая страница
            target        text,                   -- ID или название кнопки/элемента
            referrer      text,                   -- откуда пришёл (предыдущая страница)
            tg_user_id    bigint,                 -- Telegram user ID (если доступен)
            user_id       bigint,                 -- внутренний user_id (если авторизован)
            ip            inet,
            user_agent    text,
            platform      text,                   -- 'tma' | 'web' | 'ios' | 'android'
            tg_platform   text,                   -- platform из Telegram WebApp
            screen_width  int,
            screen_height int,
            language      text,
            duration_ms   int,                    -- длительность (для session_end)
            extra         jsonb       NOT NULL DEFAULT '{}'::jsonb
          );

          CREATE INDEX IF NOT EXISTS ae_ts_idx        ON analytics_events (ts DESC);
          CREATE INDEX IF NOT EXISTS ae_session_idx   ON analytics_events (session_id);
          CREATE INDEX IF NOT EXISTS ae_type_idx      ON analytics_events (event_type);
          CREATE INDEX IF NOT EXISTS ae_page_idx      ON analytics_events (page);
          CREATE INDEX IF NOT EXISTS ae_tg_user_idx   ON analytics_events (tg_user_id) WHERE tg_user_id IS NOT NULL;
          CREATE INDEX IF NOT EXISTS ae_user_idx      ON analytics_events (user_id) WHERE user_id IS NOT NULL;
        `); err != nil {
		return fmt.Errorf("analytics_events: %w", err)
	}

	return nil
}

// --- helpers -----------------------------------------------------------------

// Единообразно достаём подтверждённый email_norm:
// 1) users.email, если email_verified_at не NULL
// 2) auth_emails (последний) — fallback
// 3) lw_ledger (последний по времени) — крайний fallback
// Получаем email_norm: auth_emails → users.email → последний из lw_ledger
func getEmailNormFromCtxOrDB(c *gin.Context, db *pgxpool.Pool) (string, error) {
	// 0) Если мидлварь уже положила email_norm
	if v, ok := c.Get("email_norm"); ok {
		if s, ok2 := v.(string); ok2 && s != "" {
			return strings.ToLower(strings.TrimSpace(s)), nil
		}
	}

	var uid int64
	if v, ok := c.Get("user_id"); ok {
		if u, ok2 := v.(int64); ok2 {
			uid = u
		}
	}
	if uid == 0 {
		return "", errors.New("no_user")
	}

	// 1) auth_emails
	var em string
	_ = db.QueryRow(c, `
		SELECT lower(email_norm)::text
		FROM auth_emails
		WHERE user_id = $1
		ORDER BY id DESC
		LIMIT 1
	`, uid).Scan(&em)
	if em != "" {
		return em, nil
	}

	// 2) users.email
	_ = db.QueryRow(c, `
		SELECT lower(email)::text
		FROM users
		WHERE id = $1
		  AND email IS NOT NULL AND email <> ''
	`, uid).Scan(&em)
	if em != "" {
		return em, nil
	}

	// 3) последний email из lw_ledger для этого user_id (как крайний fallback)
	_ = db.QueryRow(c, `
		SELECT lower(email_norm)::text
		FROM lw_ledger
		WHERE user_id = $1
		  AND email_norm IS NOT NULL
		ORDER BY date_ts DESC NULLS LAST, loaded_at DESC NULLS LAST
		LIMIT 1
	`, uid).Scan(&em)
	if em != "" {
		return em, nil
	}

	return "", errors.New("no_email_norm")
}

// --- public ------------------------------------------------------------------

func (s *Server) EmailNotFoundShown(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required,email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"ok": false})
		return
	}
	email := normalizeEmail(req.Email)
	logLoginEvent(c, s.DB, email, nil, "email_not_found_modal", "tma", nil)
	c.JSON(200, gin.H{"ok": true})
}

// --- Analytics tracking ------------------------------------------------------

type AnalyticsEvent struct {
	SessionID    string         `json:"session_id"`
	EventType    string         `json:"event_type"`  // page_view, button_click, navigation, session_start, session_end
	Page         string         `json:"page"`        // текущая страница
	Target       string         `json:"target"`      // ID кнопки/элемента
	Referrer     string         `json:"referrer"`    // предыдущая страница
	TgUserID     *int64         `json:"tg_user_id"`  // Telegram user ID
	Platform     string         `json:"platform"`    // tma, web, ios, android
	TgPlatform   string         `json:"tg_platform"` // platform из TG WebApp
	ScreenWidth  *int           `json:"screen_width"`
	ScreenHeight *int           `json:"screen_height"`
	Language     string         `json:"language"`
	DurationMs   *int           `json:"duration_ms"` // для session_end
	Extra        map[string]any `json:"extra"`
}

func (s *Server) AnalyticsTrack(c *gin.Context) {
	var event AnalyticsEvent
	if err := c.ShouldBindJSON(&event); err != nil {
		c.JSON(400, gin.H{"ok": false, "error": "bad request"})
		return
	}

	if event.SessionID == "" || event.EventType == "" {
		c.JSON(400, gin.H{"ok": false, "error": "session_id and event_type required"})
		return
	}

	s.saveAnalyticsEvent(c, event)
	c.JSON(200, gin.H{"ok": true})
}

func (s *Server) AnalyticsBatch(c *gin.Context) {
	var req struct {
		Events []AnalyticsEvent `json:"events"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"ok": false, "error": "bad request"})
		return
	}

	if len(req.Events) == 0 {
		c.JSON(200, gin.H{"ok": true, "saved": 0})
		return
	}

	saved := 0
	for _, event := range req.Events {
		if event.SessionID == "" || event.EventType == "" {
			continue
		}
		s.saveAnalyticsEvent(c, event)
		saved++
	}

	c.JSON(200, gin.H{"ok": true, "saved": saved})
}

func (s *Server) saveAnalyticsEvent(c *gin.Context, event AnalyticsEvent) {
	ip := c.ClientIP()
	ua := c.Request.UserAgent()

	// Пробуем получить user_id из контекста (если авторизован)
	var userID *int64
	if v, ok := c.Get("user_id"); ok {
		if uid, ok2 := v.(int64); ok2 && uid > 0 {
			userID = &uid
		}
	}

	extra := event.Extra
	if extra == nil {
		extra = map[string]any{}
	}
	extraJSON, _ := json.Marshal(extra)

	_, _ = s.DB.Exec(c, `
		INSERT INTO analytics_events (
			session_id, event_type, page, target, referrer,
			tg_user_id, user_id, ip, user_agent, platform, tg_platform,
			screen_width, screen_height, language, duration_ms, extra
		) VALUES (
			$1, $2, $3, $4, $5,
			$6, $7, NULLIF($8,'')::inet, $9, $10, $11,
			$12, $13, $14, $15, $16::jsonb
		)
	`, event.SessionID, event.EventType, event.Page, event.Target, event.Referrer,
		event.TgUserID, userID, ip, ua, event.Platform, event.TgPlatform,
		event.ScreenWidth, event.ScreenHeight, event.Language, event.DurationMs, string(extraJSON))
}

func (s *Server) GatePublic(c *gin.Context) {
	c.JSON(200, gin.H{"blocked": false, "seconds_left": 0})
	// для last_seen (пример)
	_, _ = s.DB.Exec(c, `
		INSERT INTO users(tg_id) VALUES(1)
		ON CONFLICT (tg_id) DO UPDATE SET last_seen_at = NOW()
	`)
}

func (s *Server) UserPublic(c *gin.Context) {
	c.JSON(200, gin.H{"tg_id": 1})
}

func logLoginEvent(c *gin.Context, db *pgxpool.Pool, email string, userID *int64, eventType, source string, extra map[string]any) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || eventType == "" {
		return
	}
	ua := c.Request.UserAgent()
	ip := c.ClientIP()
	var uid *int64
	if userID != nil && *userID > 0 {
		uid = userID
	}
	if extra == nil {
		extra = map[string]any{}
	}
	b, _ := json.Marshal(extra)

	_, _ = db.Exec(c, `
	  INSERT INTO auth_login_events (email_norm, user_id, event_type, source, ip, user_agent, extra)
	  VALUES ($1, $2, $3, $4, NULLIF($5,'')::inet, $6, $7::jsonb)
	`, email, uid, eventType, source, ip, ua, string(b))
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

	// если не разрешён — логируем факт проверки и отказа
	if !exists {
		logLoginEvent(c, s.DB, email, nil, "email_check_not_allowed", "tma", map[string]any{
			"when": "before_send_code",
		})
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
	// белый список
	var allowed bool
	if err := s.DB.QueryRow(c,
		`SELECT EXISTS(SELECT 1 FROM auth_emails WHERE email_norm = $1)`,
		email,
	).Scan(&allowed); err != nil {
		c.JSON(500, gin.H{"error": "DB error"})
		return
	}
	if !allowed {
		c.JSON(403, gin.H{"error": "Email is not allowed"})
		return
	}

	// MVP: tg_id=1 → обеспечим users.id
	tgID := int64(1)
	var userID int64
	err := s.DB.QueryRow(c, `SELECT id FROM users WHERE tg_id = $1`, tgID).Scan(&userID)
	if err != nil {
		_, err = s.DB.Exec(c, `INSERT INTO users(tg_id) VALUES($1)`, tgID)
		if err != nil {
			c.JSON(500, gin.H{"error": "DB error"})
			return
		}
		_ = s.DB.QueryRow(c, `SELECT id FROM users WHERE tg_id = $1`, tgID).Scan(&userID)
	}

	// OTP
	code := rand.Intn(900000) + 100000
	codeStr := fmt.Sprintf("%06d", code)
	hash := codeStr // MVP
	expires := time.Now().Add(30 * time.Minute)
	resendAfter := time.Now().Add(30 * time.Second)

	_, _ = s.DB.Exec(c, `DELETE FROM otp WHERE user_id = $1`, userID)
	_, err = s.DB.Exec(c, `
		INSERT INTO otp (user_id, email, code_hash, sent_at, expires_at, resend_after)
		VALUES ($1, $2, $3, NOW(), $4, $5)
	`, userID, email, hash, expires, resendAfter)
	if err != nil {
		c.JSON(500, gin.H{"error": "Send error"})
		return
	}

	if err := s.sendEmail(email, codeStr); err != nil {
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
		c.JSON(400, gin.H{"error": "Invalid input"})
		return
	}
	email := normalizeEmail(req.Email)

	// MVP: tg_id=1 → users.id
	tgID := int64(1)
	var userID int64
	if err := s.DB.QueryRow(c, `SELECT id FROM users WHERE tg_id=$1`, tgID).Scan(&userID); err != nil {
		c.JSON(404, gin.H{"error": "User not found"})
		return
	}

	// проверка OTP
	var hash string
	err := s.DB.QueryRow(c, `
		SELECT code_hash
		FROM otp
		WHERE user_id=$1 AND email=$2 AND expires_at>NOW()
	`, userID, email).Scan(&hash)
	if err != nil || hash != req.Code {
		c.JSON(400, gin.H{"error": "Invalid or expired code"})
		return
	}

	// consumed
	_, _ = s.DB.Exec(c, `DELETE FROM otp WHERE user_id=$1 AND email=$2`, userID, email)

	// фиксируем e-mail в users и обновляем/создаём привязку в auth_emails
	_, _ = s.DB.Exec(c, `UPDATE users SET email=$1, email_verified_at=NOW() WHERE id=$2`, email, userID)
	_, _ = s.DB.Exec(c, `
		INSERT INTO auth_emails (user_id, email_norm)
		VALUES ($1, $2)
		ON CONFLICT (email_norm) DO UPDATE SET user_id = EXCLUDED.user_id
	`, userID, email)

	// токены (реализация в auth.go)
	token, err := IssueAccessToken(userID)
	if err != nil {
		c.JSON(500, gin.H{"error": "token error"})
		return
	}
	if rt, exp, err := IssueRefreshToken(userID); err == nil {
		setRefreshCookie(c, rt, exp)
	}

	// ← лог успешного входа ДО ответа
	logLoginEvent(c, s.DB, email, &userID, "login_ok", "tma", map[string]any{
		"method": "otp",
	})

	c.JSON(200, gin.H{"token": token, "verified": true})
}

// SMTP (MVP)
func (s *Server) sendEmail(to, code string) error {
	from := os.Getenv("SMTP_USER")
	pass := os.Getenv("SMTP_PASS")
	host := os.Getenv("SMTP_HOST")
	port := os.Getenv("SMTP_PORT")
	if from == "" || pass == "" || host == "" || port == "" {
		return fmt.Errorf("SMTP env vars not set")
	}

	msg := []byte("To: " + to + "\r\n" +
		"Subject: Your OTP Code\r\n\r\n" +
		"Your verification code is: " + code + "\r\n")

	auth := smtp.PlainAuth("", from, pass, host)
	addr := host + ":" + port
	tlsCfg := &tls.Config{ServerName: host}

	conn, err := tls.Dial("tcp", addr, tlsCfg)
	if err != nil {
		return err
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
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

// --- protected ---------------------------------------------------------------

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
		SELECT email, email_verified_at IS NOT NULL FROM users WHERE id=$1
	`, userID).Scan(&email, &emailVerified); err != nil {
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

// GET /api/winners/my — выигрыши по email_norm (надёжнее, чем по user_id)
func (s *Server) WinnersMy(c *gin.Context) {
	emailNorm, err := getEmailNormFromCtxOrDB(c, s.DB)
	if err != nil || emailNorm == "" {
		c.JSON(401, gin.H{"error": "unauthorized_no_email"})
		return
	}

	rows, err := s.DB.Query(c, `
		SELECT draw_id,
		       amount_eur,
		       rank,
		       reason,
		       computed_at,
		       claimed_at,
		       (claimed_at IS NOT NULL) AS claimed
		FROM public.lw_winners
		WHERE email_norm = $1::citext
		ORDER BY computed_at DESC, rank ASC
		LIMIT 200
	`, emailNorm)
	if err != nil {
		c.JSON(500, gin.H{"error": "db error"})
		return
	}
	defer rows.Close()

	type Win struct {
		DrawID     string     `json:"draw_id"`
		AmountEUR  float64    `json:"amount_eur"`
		Rank       int        `json:"rank"`
		Reason     string     `json:"reason"`
		ComputedAt time.Time  `json:"computed_at"`
		ClaimedAt  *time.Time `json:"claimed_at,omitempty"`
		Claimed    bool       `json:"claimed"`
	}
	var wins []Win
	for rows.Next() {
		var w Win
		if err := rows.Scan(&w.DrawID, &w.AmountEUR, &w.Rank, &w.Reason, &w.ComputedAt, &w.ClaimedAt, &w.Claimed); err != nil {
			c.JSON(500, gin.H{"error": "scan error"})
			return
		}
		wins = append(wins, w)
	}
	c.JSON(200, gin.H{"winnings": wins})
}

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
	var list []W
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

func (s *Server) WinnersAgg(c *gin.Context) {
	rng := c.Query("range")
	from, to := completedBoundsForRange(rng, time.Now())
	const q = `
	  SELECT email_norm,
	         COUNT(*)::int                      AS win_count,
	         COALESCE(SUM(amount_eur),0)::float AS win_amount,
	         BOOL_OR(claimed_at IS NOT NULL)    AS claimed
	  FROM public.lw_winners
	  WHERE draw_id >= $1::date::text AND draw_id < $2::date::text
	  GROUP BY email_norm
	  ORDER BY win_amount DESC
	  LIMIT 200;
	`
	rows, err := s.DB.Query(c, q, from.Format("2006-01-02"), to.Format("2006-01-02"))
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
	var list []Row
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

// GET /api/me — возвращаем внешний id + флаг показа модалки
func (s *Server) MeProtected(c *gin.Context) {
	emailNorm, err := getEmailNormFromCtxOrDB(c, s.DB)
	if err != nil || emailNorm == "" {
		c.JSON(401, gin.H{"error": "unauthorized_no_email"})
		return
	}

	// внешний id (user_id из lw_ledger) — берём максимальный по этому email
	var ledgerUserID sql.NullInt64
	_ = s.DB.QueryRow(c, `
		SELECT NULLIF(MAX(l.user_id),0)::bigint
		FROM lw_ledger l
		WHERE l.email_norm = $1::citext
	`, emailNorm).Scan(&ledgerUserID)

	var ledgerPtr *int64
	if ledgerUserID.Valid {
		v := ledgerUserID.Int64
		ledgerPtr = &v
	}

	// Показываем модалку если есть незаклеймленный выигрыш за вчера (UTC)
	// Окно клейма: с 06:03 UTC до 06:03 UTC следующего дня (~24 часа)
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")
	var shouldShow bool
	_ = s.DB.QueryRow(c, `
		SELECT EXISTS (
		    SELECT 1
		    FROM public.lw_winners w
		    WHERE w.email_norm = $1::citext
		      AND w.draw_id    = $2
		      AND w.claimed_at IS NULL
		) AS should_show
	`, emailNorm, yesterday).Scan(&shouldShow)

	c.JSON(200, gin.H{
		"email":                    emailNorm,
		"email_verified":           true,
		"balance":                  0,
		"ledger_user_id":           ledgerPtr,
		"auth_user_id":             nil,
		"external_id":              ledgerPtr,
		"should_show_claim_denied": shouldShow,
	})
}

// POST /api/winners/claim { draw_id } — клейм по (draw_id, user_id)
func (s *Server) WinnersClaim(c *gin.Context) {
	uidAny, _ := c.Get("user_id")
	userID, ok := uidAny.(int64)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}

	var req struct {
		DrawID string `json:"draw_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.DrawID) == "" {
		c.JSON(400, gin.H{"error": "bad_request"})
		return
	}

	const q = `
		UPDATE public.lw_winners
		   SET claimed_at = COALESCE(claimed_at, NOW())
		 WHERE draw_id = $1
		   AND user_id  = $2
		 RETURNING amount_eur, claimed_at
	`
	var amount float64
	var claimedAt time.Time
	if err := s.DB.QueryRow(c, q, req.DrawID, userID).Scan(&amount, &claimedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			c.JSON(404, gin.H{"error": "not_found"})
			return
		}
		c.JSON(500, gin.H{"error": "db_error"})
		return
	}

	c.JSON(200, gin.H{
		"ok":         true,
		"draw_id":    req.DrawID,
		"amount_eur": amount,
		"claimed_at": claimedAt,
	})
}

func (s *Server) ClaimDeniedAck(c *gin.Context) {
	emailNorm, err := getEmailNormFromCtxOrDB(c, s.DB)
	if err != nil || emailNorm == "" {
		c.JSON(401, gin.H{"error": "unauthorized_no_email"})
		return
	}

	// 1) Помечаем, что модалка показана
	_, e := s.DB.Exec(c, `
		INSERT INTO claim_denied_oneoff(email_norm, shown_at)
		VALUES ($1, NOW())
		ON CONFLICT (email_norm) DO UPDATE SET shown_at = NOW()
	`, emailNorm)
	if e != nil {
		c.JSON(500, gin.H{"error": "db_error"})
		return
	}

	// BONUS: 2) Создаём «ожидающую» запись в lw_winners (если её ещё нет)
	uidAny, _ := c.Get("user_id")
	userID, ok := uidAny.(int64)
	if ok && userID > 0 {
		amount := 500.0
		if v := os.Getenv("BONUS_AMOUNT_EUR"); v != "" {
			if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
				amount = f
			}
		}
		today := time.Now().UTC().Format("2006-01-02") // draw_id как YYYY-MM-DD
		// Вставляем, если ещё нет бонусной строки на сегодня для этого user_id
		_, _ = s.DB.Exec(c, `
			INSERT INTO public.lw_winners (draw_id, email_norm, user_id, amount_eur, rank, reason, computed_at, claimed_at)
			SELECT $1, $2::citext, $3, $4, 0, 'bonus', NOW(), NULL
			WHERE NOT EXISTS (
				SELECT 1 FROM public.lw_winners 
				WHERE draw_id = $1 AND user_id = $3 AND reason = 'bonus'
			)
		`, today, emailNorm, userID, amount)
	}

	c.JSON(200, gin.H{"ok": true})
}

func (s *Server) UIProgress(c *gin.Context) {
	const capEUR = 5000.0

	now := time.Now().UTC()
	todayStr := now.Format("2006-01-02")

	var totalPrizes, totalClaimed sql.NullFloat64

	// Считаем суммарный "банк" и суммарно заклеймленное за ВСЕ
	// draw_id < сегодня (т.е. за полностью завершённые дни).
	err := s.DB.QueryRow(c, `
		SELECT
		  COALESCE(SUM(amount_eur), 0)::float8 AS total_prizes,
		  COALESCE(SUM(CASE WHEN claimed_at IS NOT NULL THEN amount_eur ELSE 0 END), 0)::float8 AS total_claimed
		FROM public.lw_winners
		WHERE draw_id ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
		  AND draw_id::date < $1::date
	`, todayStr).Scan(&totalPrizes, &totalClaimed)

	if err != nil && !errors.Is(err, sql.ErrNoRows) && !errors.Is(err, pgx.ErrNoRows) {
		c.JSON(500, gin.H{"error": "db_error"})
		return
	}

	tp := 0.0
	tc := 0.0
	if totalPrizes.Valid {
		tp = totalPrizes.Float64
	}
	if totalClaimed.Valid {
		tc = totalClaimed.Float64
	}

	// Накопленный банк = 1/5 от незабранной суммы за все прошлые дни
	// Каждый день разыгрывается ~500€, если не забрали — 500/5 = 100€ добавляется к прогрессу
	unclaimed := tp - tc
	if unclaimed < 0 {
		unclaimed = 0
	}
	amount := unclaimed / 5.0
	if amount > capEUR {
		amount = capEUR
	}
	// Округляем до целого
	amountRounded := int(amount + 0.5)

	// Следующий «шаг» прогресса — в 6:00 UTC (9:00 МСК) следующего дня
	resetAt := time.Date(now.Year(), now.Month(), now.Day()+1, 6, 0, 0, 0, time.UTC)

	c.JSON(200, gin.H{
		"draw_id":      todayStr,      // просто "сегодня", можно не использовать на фронте
		"amount_eur":   amountRounded, // накопленный банк 0..5000 (округлённо)
		"cap_eur":      capEUR,        // фронт делит на это
		"reset_at_utc": resetAt.Format(time.RFC3339),
	})
}

func (s *Server) ClaimBonus(c *gin.Context) {
	uidAny, _ := c.Get("user_id")
	userID, ok := uidAny.(int64)
	if !ok {
		c.JSON(401, gin.H{"error": "unauthorized"})
		return
	}

	var req struct {
		Amount float64 `json:"amount"`
		Reason string  `json:"reason"`
	}
	if err := json.NewDecoder(c.Request.Body).Decode(&req); err != nil {
		c.JSON(400, gin.H{"error": "bad request"})
		return
	}
	if req.Amount <= 0 {
		c.JSON(400, gin.H{"error": "amount must be > 0"})
		return
	}
	if strings.TrimSpace(req.Reason) == "" {
		req.Reason = "bonus"
	}

	// Нужен email_norm
	emailNorm, err := getEmailNormFromCtxOrDB(c, s.DB)
	if err != nil || emailNorm == "" {
		c.JSON(401, gin.H{"error": "unauthorized_no_email"})
		return
	}

	// draw_id = вчерашняя дата в UTC (как в скрипте lw_job)
	// Окно клейма: с 06:03 UTC до 06:03 UTC следующего дня (~24 часа)
	yesterday := time.Now().UTC().AddDate(0, 0, -1).Format("2006-01-02")

	ctx := c.Request.Context()
	tx, err := s.DB.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		c.JSON(500, gin.H{"error": "tx begin error"})
		return
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// 0) Проверяем, что у пользователя есть незаклеймленный выигрыш за вчера
	var existYesterday bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
		  SELECT 1
		  FROM public.lw_winners
		  WHERE email_norm = $1::citext
		    AND draw_id    = $2
		    AND claimed_at IS NULL
		)
	`, emailNorm, yesterday).Scan(&existYesterday); err != nil {
		c.JSON(500, gin.H{"error": "db error"})
		return
	}
	if !existYesterday {
		c.JSON(403, gin.H{"error": "no_unclaimed_reward"})
		return
	}

	// 1) Денежная часть
	if _, err := tx.Exec(ctx, `
		INSERT INTO wallet_ledger(user_id, amount_eur, reason)
		VALUES($1, $2, $3)
	`, userID, req.Amount, req.Reason); err != nil {
		c.JSON(500, gin.H{"error": "insert ledger error"})
		return
	}
	if _, err := tx.Exec(ctx, `
		UPDATE users SET balance = COALESCE(balance,0) + $1 WHERE id=$2
	`, req.Amount, userID); err != nil {
		c.JSON(500, gin.H{"error": "update balance error"})
		return
	}

	// 2) Помечаем «вчерашний» выигрыш(и) как заклеймленные и привязываем user_id.
	cmdTag, err := tx.Exec(ctx, `
		UPDATE public.lw_winners
		   SET claimed_at = COALESCE(claimed_at, NOW()),
		       user_id    = COALESCE(user_id, $1)
		 WHERE email_norm = $2::citext
		   AND draw_id    = $3
		   AND claimed_at IS NULL
	`, userID, emailNorm, yesterday)
	if err != nil {
		c.JSON(500, gin.H{"error": "winners update error"})
		return
	}
	if cmdTag.RowsAffected() == 0 {
		c.JSON(409, gin.H{"error": "already_claimed_or_missing"})
		return
	}

	// 3) Отметим, что модалка «показана»
	_, _ = tx.Exec(ctx, `
		UPDATE public.claim_denied_oneoff
		   SET shown_at = NOW()
		 WHERE email_norm = $1::citext
		   AND shown_at IS NULL
	`, emailNorm)

	// 4) Уведомление в PostgreSQL (как было)
	payload := map[string]any{
		"event":      "claim_bonus",
		"user_id":    userID,
		"amount_eur": req.Amount,
		"reason":     req.Reason,
		"ts":         time.Now().UTC(),
	}
	if b, _ := json.Marshal(payload); len(b) > 0 {
		_, _ = tx.Exec(ctx, `SELECT pg_notify('lw_winner_events', $1)`, string(b))
	}

	var newBal float64
	if err := tx.QueryRow(ctx, `SELECT COALESCE(balance,0) FROM users WHERE id=$1`, userID).Scan(&newBal); err != nil {
		c.JSON(500, gin.H{"error": "get balance error"})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		c.JSON(500, gin.H{"error": "tx commit error"})
		return
	}

	// --- Customer.io webhook: бонус начислен, шлём письмо -------------------
	// фиксируем момент, когда операция точно завершилась
	claimedAt := time.Now().UTC()

	// именно эти поля вы договорились слать:
	// {
	//   "email": "user@example.com",
	//   "user_id": 1454626993,
	//   "reward_amount": 25.5,
	//   "draw_id": "2025-11-19",
	//   "claimed_at": "2025-11-20T12:34:56Z",
	//   "event_name": "lucky_winner_reward"
	// }
	cioPayload := CustomerIoPayload{
		Email:        emailNorm,
		UserID:       userID,
		RewardAmount: req.Amount,
		DrawID:       yesterday,
		ClaimedAt:    claimedAt.Format(time.RFC3339),
		EventName:    "lucky_winner_reward",
	}

	// Шлём асинхронно, чтобы не тормозить ответ в мини-апп
	go func(p CustomerIoPayload) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := sendCustomerIoBonus(ctx, p); err != nil {
			log.Printf("customer.io webhook error: user_id=%d email=%s err=%v", p.UserID, p.Email, err)
		}
	}(cioPayload)

	// Ответ клиенту (мини-аппу)
	c.JSON(200, gin.H{
		"new_balance": newBal,
	})
}

// feed/top10 (как были)
func (s *Server) WinnersFeed(c *gin.Context) {
	rng := c.Query("range")
	from, to := completedBoundsForRange(rng, time.Now())
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
	  SELECT draw_id, email_norm, user_id, amount_eur, (claimed_at IS NOT NULL) AS claimed
	  FROM public.lw_winners
	  WHERE draw_id >= $1::date::text AND draw_id < $2::date::text
	  ORDER BY draw_id, amount_eur DESC, email_norm
	  LIMIT $3
	`
	rows, err := s.DB.Query(c, q, from.Format("2006-01-02"), to.Format("2006-01-02"), lim)
	if err != nil {
		c.JSON(500, gin.H{"error": "db error"})
		return
	}
	defer rows.Close()

	type Row struct {
		DrawID    string  `json:"draw_id"`
		EmailNorm string  `json:"email_norm"`
		UserID    *int64  `json:"user_id"`
		Amount    float64 `json:"amount_eur"`
		Claimed   bool    `json:"claimed"`
	}
	var list []Row
	for rows.Next() {
		var (
			drawID, email string
			uid           sql.NullInt64
			amount        float64
			claimed       bool
		)
		if err := rows.Scan(&drawID, &email, &uid, &amount, &claimed); err != nil {
			c.JSON(500, gin.H{"error": "scan error"})
			return
		}
		var userPtr *int64
		if uid.Valid {
			v := uid.Int64
			userPtr = &v
		}
		list = append(list, Row{DrawID: drawID, EmailNorm: email, UserID: userPtr, Amount: amount, Claimed: claimed})
	}
	c.JSON(200, list)
}

func (s *Server) WinnersTop10(c *gin.Context) {
	from, to := completedBoundsForRange("top10", time.Now())
	const q = `
	  SELECT email_norm,
	         COUNT(*)::int, COALESCE(SUM(amount_eur),0)::float8,
	         BOOL_OR(claimed_at IS NOT NULL)
	  FROM public.lw_winners
	  WHERE draw_id >= $1::date::text AND draw_id < $2::date::text
	  GROUP BY email_norm
	  ORDER BY 3 DESC
	  LIMIT 10;
	`
	rows, err := s.DB.Query(c, q, from.Format("2006-01-02"), to.Format("2006-01-02"))
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
	var list []Row
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
