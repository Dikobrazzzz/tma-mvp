// /opt/tma-mvp/web/app/lucky-winner/auth.go
package main

import (
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"log"
)

type Claims struct {
	UserID int64 `json:"uid"`
	jwt.RegisteredClaims
}

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

func AuthRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if !strings.HasPrefix(auth, "Bearer ") {
			c.AbortWithStatusJSON(401, gin.H{"error": "no token"})
			return
		}
		raw := strings.TrimPrefix(auth, "Bearer ")

		var claims Claims
		token, err := jwt.ParseWithClaims(raw, &claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(os.Getenv("JWT_SECRET")), nil
		})
		if err != nil || !token.Valid {
			log.Printf("Invalid token: %v", err)
			c.AbortWithStatusJSON(401, gin.H{"error": "invalid token"})
			return
		}

		if claims.ExpiresAt != nil && time.Now().After(claims.ExpiresAt.Time) {
			log.Printf("Token expired for user %d", claims.UserID)
			c.AbortWithStatusJSON(401, gin.H{"error": "token expired"})
			return
		}

		c.Set("user_id", claims.UserID)
		c.Next()
	}
}
