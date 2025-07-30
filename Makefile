APP_NAME=whatsapp-bot
PROJECT_ID=sonorous-dragon-276210
REPOSITORY=gcr
LOCATION=europe-west9

ARTIFACT_REGISTRY_HOST=$(LOCATION)-docker.pkg.dev
GCP_TAG_NAME=$(ARTIFACT_REGISTRY_HOST)/$(PROJECT_ID)/$(REPOSITORY)/$(APP_NAME)
GIT_BRANCH = $(shell git rev-parse --abbrev-ref HEAD)
GIT_HASH = $(shell git rev-parse --short HEAD)
GIT_DATE = $(shell git show -s --date=format:'%Y%m%d-%H%M' --format=%cd)

GOOS ?= linux
GOARCH ?= amd64


############
# Docker
#

docker-build: import-binaries
	@echo "Building $(APP_NAME)"
	docker build -t $(APP_NAME) .

docker-tag-gcp-latest:
	@echo "Tagging $(APP_NAME) as $(GCP_TAG_NAME):latest"
	docker tag $(APP_NAME) $(GCP_TAG_NAME):latest

docker-push-gcp:
	@echo "Pushing $(APP_NAME) to $(GCP_TAG_NAME)"
	docker push $(GCP_TAG_NAME)

docker-release:
	docker buildx build --platform linux/amd64 -t $(GCP_TAG_NAME):$(GIT_HASH) -t ${GCP_TAG_NAME}:latest --push .

docker-make-builder:
	docker buildx create --name mod4docker --use
	docker buildx inspect --bootstrap

docker-deploy: docker-release
	gcloud container clusters get-credentials autopilot-cluster-1 --region europe-west1 --project sonorous-dragon-276210  && kubectl rollout restart deployment mod4-scheduler-deployment
