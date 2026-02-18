#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/models.conf"
IMAGE_NAME="mbarc98/taskmesh-ollama"

PUSH=false
if [ "$1" = "--push" ]; then
    PUSH=true
fi

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Error: $CONFIG_FILE not found"
    exit 1
fi

echo "Building Ollama images from $CONFIG_FILE"
echo "========================================="

while IFS= read -r line || [ -n "$line" ]; do
    # Skip comments and empty lines
    [[ "$line" =~ ^#.*$ || -z "${line// }" ]] && continue

    RAM=$(echo "$line" | awk '{print $1}')
    MODEL=$(echo "$line" | awk '{print $2}')

    # Convert model name to a valid Docker tag (replace : with -)
    MODEL_TAG=$(echo "$MODEL" | tr ':' '-')
    TAG="${RAM}-${MODEL_TAG}"

    echo ""
    echo "Building: $IMAGE_NAME:$TAG (model: $MODEL)"
    echo "-----------------------------------------"

    docker build \
        --build-arg OLLAMA_MODEL="$MODEL" \
        -t "$IMAGE_NAME:$TAG" \
        "$SCRIPT_DIR"

    if [ "$PUSH" = true ]; then
        echo "Pushing: $IMAGE_NAME:$TAG"
        docker push "$IMAGE_NAME:$TAG"
    fi

done < "$CONFIG_FILE"

echo ""
echo "========================================="
echo "Done! Built images:"
docker images "$IMAGE_NAME" --format "  {{.Repository}}:{{.Tag}}"
