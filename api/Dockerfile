# /opt/tma-mvp/api/Dockerfile
FROM golang:1.23 AS build
WORKDIR /src

# 1) модуль
COPY go.mod ./
# (go.sum может отсутствовать — ок)
# COPY go.sum ./

# 2) копируем весь код
COPY . .

# 3) подтягиваем зависимости по импортам и приводим модуль в порядок
RUN go get ./... && go mod tidy

# 4) статическая сборка
ENV CGO_ENABLED=0
RUN go build -trimpath -ldflags="-s -w" -o /api ./...

# ---- runtime ----
FROM gcr.io/distroless/base-debian12
WORKDIR /
COPY --from=build /api /api
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/api"]
