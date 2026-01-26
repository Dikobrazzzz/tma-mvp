# /opt/tma-mvp/api/Dockerfile
FROM golang:1.23 AS build
WORKDIR /src

COPY go.mod ./

COPY . .

RUN go get ./... && go mod tidy

ENV CGO_ENABLED=0
RUN go build -trimpath -ldflags="-s -w" -o /api ./...

FROM gcr.io/distroless/base-debian12
WORKDIR /
COPY --from=build /api /api
EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/api"]
