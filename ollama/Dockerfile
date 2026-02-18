FROM ollama/ollama

ARG OLLAMA_MODEL=qwen2.5:3b

# Pull the model during build so it's baked into the image
RUN ollama serve & sleep 5 && ollama pull ${OLLAMA_MODEL} && pkill ollama
