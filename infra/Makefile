# glasshouse aws. default profile is hasura (aws-ha). never use the default profile.

export AWS_PROFILE ?= hasura
export AWS_REGION  ?= us-east-1

ACCOUNT := 769983710114
FN      := gh-inference
ROLE    := gh-inference-role
SECRET  := glasshouse/anthropic
ZIP     := build/gh-inference.zip
ROOT    := $(abspath ..)

.PHONY: whoami package secret role function url table worker-user config deploy worker-secrets worker-deploy

whoami:
	aws sts get-caller-identity --region $(AWS_REGION)

package:
	mkdir -p build
	cd $(ROOT)/services/inference && pnpm bundle:lambda
	rm -rf build/pkg && mkdir -p build/pkg/prompts
	cp $(ROOT)/services/inference/dist/lambda.js build/pkg/lambda.js
	cp $(ROOT)/services/inference/prompts/p1.md build/pkg/prompts/p1.md
	rm -f $(ZIP)
	cd build/pkg && zip -q -r ../gh-inference.zip .

secret:
	node put-secret.mjs

role:
	aws iam get-role --role-name $(ROLE) >/dev/null 2>&1 || \
	  aws iam create-role --role-name $(ROLE) --assume-role-policy-document file://lambda-trust.json
	aws iam put-role-policy --role-name $(ROLE) --policy-name gh-inference --policy-document file://lambda-policy.json
	@echo "waiting for iam to propagate"
	sleep 10

function: package
	@if aws lambda get-function --function-name $(FN) --region $(AWS_REGION) >/dev/null 2>&1; then \
	  aws lambda wait function-updated --function-name $(FN) --region $(AWS_REGION) || true; \
	  aws lambda update-function-code --function-name $(FN) --region $(AWS_REGION) --zip-file fileb://$(ZIP); \
	  aws lambda wait function-updated --function-name $(FN) --region $(AWS_REGION); \
	else \
	  aws lambda create-function --function-name $(FN) --region $(AWS_REGION) \
	    --runtime nodejs22.x --architecture arm64 --handler lambda.handler \
	    --role arn:aws:iam::$(ACCOUNT):role/$(ROLE) \
	    --zip-file fileb://$(ZIP) --timeout 180 --memory-size 512 \
	    --environment 'Variables={GH_ANTHROPIC_SECRET=$(SECRET),GH_MODEL=claude-sonnet-4-6,GH_SESSIONS_TABLE=gh_sessions}'; \
	  aws lambda wait function-active --function-name $(FN) --region $(AWS_REGION); \
	fi

config:
	aws lambda wait function-updated --function-name $(FN) --region $(AWS_REGION) || true
	aws lambda update-function-configuration --function-name $(FN) --region $(AWS_REGION) \
	  --environment 'Variables={GH_ANTHROPIC_SECRET=$(SECRET),GH_MODEL=claude-sonnet-4-6,GH_SESSIONS_TABLE=gh_sessions}'
	aws lambda wait function-updated --function-name $(FN) --region $(AWS_REGION)

url:
	aws lambda get-function-url-config --function-name $(FN) --region $(AWS_REGION) >/dev/null 2>&1 || \
	  aws lambda create-function-url-config --function-name $(FN) --region $(AWS_REGION) \
	    --auth-type AWS_IAM --invoke-mode RESPONSE_STREAM
	aws lambda get-function-url-config --function-name $(FN) --region $(AWS_REGION) \
	  --query FunctionUrl --output text

table:
	aws dynamodb describe-table --table-name gh_sessions --region $(AWS_REGION) >/dev/null 2>&1 || \
	  aws dynamodb create-table --table-name gh_sessions --region $(AWS_REGION) \
	    --billing-mode PAY_PER_REQUEST \
	    --attribute-definitions AttributeName=sid,AttributeType=S \
	    --key-schema AttributeName=sid,KeyType=HASH
	aws dynamodb update-time-to-live --table-name gh_sessions --region $(AWS_REGION) \
	  --time-to-live-specification Enabled=true,AttributeName=ttl >/dev/null 2>&1 || true

worker-user:
	aws iam get-user --user-name gh-worker >/dev/null 2>&1 || aws iam create-user --user-name gh-worker
	aws iam put-user-policy --user-name gh-worker --policy-name gh-worker-invoke --policy-document file://worker-policy.json
	aws lambda add-permission --function-name $(FN) --region $(AWS_REGION) \
	  --statement-id gh-worker-url --action lambda:InvokeFunctionUrl \
	  --principal arn:aws:iam::$(ACCOUNT):user/gh-worker \
	  --function-url-auth-type AWS_IAM >/dev/null 2>&1 || true

deploy: whoami secret role table function config url
	@echo "deployed $(FN)"

worker-secrets:
	node push-worker-secrets.mjs

worker-deploy:
	cd $(ROOT) && pnpm --filter @glasshouse/web build
	cd $(ROOT)/apps/worker && pnpm exec wrangler deploy
