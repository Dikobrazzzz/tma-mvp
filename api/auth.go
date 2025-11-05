// /opt/tma-mvp/api/auth.go
package main

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID int64 `json:"uid"`
	jwt.RegisteredClaims
}

// ===== Access token =====

func IssueAccessToken(userID int64) (string, error) {
	secret := []byte(os.Getenv("JWT_SECRET"))
	if len(secret) == 0 {
		return "", fmt.Errorf("JWT_SECRET is not set")
	}

	ttl := 7 * 24 * time.Hour
	if v := os.Getenv("JWT_TTL"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			ttl = d
		}
	}

	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprintf("%d", userID),
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(time.Now().UTC().Add(ttl)),
			Issuer:    "lucky-api",
		},
	}

	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return t.SignedString(secret)
}

// ===== Refresh token (cookie) =====

func IssueRefreshToken(userID int64) (string, time.Time, error) {
	secret := []byte(os.Getenv("JWT_SECRET"))
	if len(secret) == 0 {
		return "", time.Time{}, fmt.Errorf("JWT_SECRET is not set")
	}

	ttl := 30 * 24 * time.Hour // 30 дней по умолчанию
	if v := os.Getenv("JWT_REFRESH_TTL"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			ttl = d
		}
	}

	exp := time.Now().UTC().Add(ttl)

	claims := Claims{
		UserID: userID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprintf("%d", userID),
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(exp),
			Issuer:    "lucky-api-refresh",
		},
	}

	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := t.SignedString(secret)
	return signed, exp, err
}

func parseRefresh(raw string) (*Claims, error) {
	secret := []byte(os.Getenv("JWT_SECRET"))
	var claims Claims
	_, err := jwt.ParseWithClaims(raw, &claims, func(t *jwt.Token) (interface{}, error) {
		return secret, nil
	})
	if err != nil {
		return nil, err
	}
	return &claims, nil
}

// ===== Gin middleware (Bearer access) =====

func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "no token"})
			return
		}
		raw := strings.TrimPrefix(auth, "Bearer ")

		secret := []byte(os.Getenv("JWT_SECRET"))
		var claims Claims
		token, err := jwt.ParseWithClaims(raw, &claims, func(t *jwt.Token) (interface{}, error) {
			return secret, nil
		})
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		if claims.ExpiresAt != nil && time.Now().After(claims.ExpiresAt.Time) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token expired"})
			return
		}

		c.Set("user_id", claims.UserID)
		c.Next()
	}
}

// ===== Helpers for refresh cookie =====

func cookieDomain() string {
	if v := os.Getenv("COOKIE_DOMAIN"); v != "" {
		return v
	}
	// по умолчанию — пусто (текущий хост)
	return ""
}

func setRefreshCookie(c *gin.Context, token string, exp time.Time) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "rt",
		Value:    token,
		Path:     "/",
		Domain:   cookieDomain(),
		Expires:  exp,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode, // если нужен кросс-сабдомен/iframe — поставь SameSite=None
	})
}

func clearRefreshCookie(c *gin.Context) {
	http.SetCookie(c.Writer, &http.Cookie{
		Name:     "rt",
		Value:    "",
		Path:     "/",
		Domain:   cookieDomain(),
		Expires:  time.Unix(0, 0),
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})
}

// ===== /api/auth/refresh =====
// Берёт refresh из HttpOnly cookie и выдаёт новый access (и ротирует refresh).

func (s *Server) Refresh(c *gin.Context) {
	rt, err := c.Request.Cookie("rt")
	if err != nil || rt.Value == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "no refresh"})
		return
	}

	claims, err := parseRefresh(rt.Value)
	if err != nil || (claims.ExpiresAt != nil && time.Now().After(claims.ExpiresAt.Time)) {
		clearRefreshCookie(c)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "refresh expired"})
		return
	}

	// Выдаём новый access и ротируем refresh
	access, err := IssueAccessToken(claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "issue access"})
		return
	}
	newRT, exp, err := IssueRefreshToken(claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "issue refresh"})
		return
	}
	setRefreshCookie(c, newRT, exp)
	c.JSON(http.StatusOK, gin.H{"token": access})
}

func (s *Server) Logout(c *gin.Context) {
    clearRefreshCookie(c)         // уже есть helper
    c.JSON(200, gin.H{"ok": true})
}
