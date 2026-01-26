// /opt/tma-mvp/api/tg_init.go
package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

type TGUser struct {
	ID int64 `json:"id"`
}

func (s *Server) TgInitLogin(c *gin.Context) {
	var req struct {
		InitData string `json:"init_data" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": "bad request"})
		return
	}

	botToken := os.Getenv("TG_BOT_TOKEN")
	if botToken == "" {
		c.JSON(500, gin.H{"error": "TG_BOT_TOKEN not set"})
		return
	}

	tgUser, err := ValidateInitData(req.InitData, botToken)
	if err != nil {
		c.JSON(401, gin.H{"error": "invalid initData"})
		return
	}

	var userID int64
	err = s.DB.QueryRow(c, `SELECT id FROM users WHERE tg_id=$1`, tgUser.ID).Scan(&userID)
	if err != nil {
		if _, e := s.DB.Exec(c, `INSERT INTO users(tg_id) VALUES($1)`, tgUser.ID); e != nil {
			c.JSON(500, gin.H{"error": "db error"})
			return
		}
		if err = s.DB.QueryRow(c, `SELECT id FROM users WHERE tg_id=$1`, tgUser.ID).Scan(&userID); err != nil {
			c.JSON(500, gin.H{"error": "db error"})
			return
		}
	}

	access, err := IssueAccessToken(userID)
	if err != nil {
		c.JSON(500, gin.H{"error": "issue access"})
		return
	}
	rt, exp, err := IssueRefreshToken(userID)
	if err != nil {
		c.JSON(500, gin.H{"error": "issue refresh"})
		return
	}
	setRefreshCookie(c, rt, exp)

	c.JSON(200, gin.H{"token": access})
}

func ValidateInitData(initData, botToken string) (TGUser, error) {
	vals, err := url.ParseQuery(initData)
	if err != nil {
		return TGUser{}, fmt.Errorf("parse initData: %w", err)
	}

	hash := vals.Get("hash")
	if hash == "" {
		return TGUser{}, fmt.Errorf("no hash")
	}
	vals.Del("hash")
	authDate := vals.Get("auth_date")

	keys := make([]string, 0, len(vals))
	for k := range vals {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	for i, k := range keys {
		if i > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(vals.Get(k))
	}
	dcs := b.String()

	secret := sha256.Sum256([]byte(botToken))
	mac := hmac.New(sha256.New, secret[:])
	mac.Write([]byte(dcs))
	sumHex := hex.EncodeToString(mac.Sum(nil))

	if !hmac.Equal([]byte(strings.ToLower(hash)), []byte(strings.ToLower(sumHex))) {
		return TGUser{}, fmt.Errorf("bad hash")
	}

	if authDate != "" {
		sec, err := strconv.ParseInt(authDate, 10, 64)
		if err == nil && sec > 0 {
			if time.Since(time.Unix(sec, 0)) > 5*time.Minute {
				return TGUser{}, fmt.Errorf("initData expired")
			}
		}
	}

	var u TGUser
	uStr := vals.Get("user")
	if uStr == "" {
		return TGUser{}, fmt.Errorf("no user")
	}
	if err := json.Unmarshal([]byte(uStr), &u); err != nil {
		return TGUser{}, fmt.Errorf("bad user json: %w", err)
	}
	if u.ID == 0 {
		return TGUser{}, fmt.Errorf("no user.id")
	}

	return u, nil
}
