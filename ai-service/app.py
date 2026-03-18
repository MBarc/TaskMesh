import os
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from transcription import transcribe_audio, get_model
from extraction import extract_tasks_from_text, generate_field_content, classify_email_content, generate_reply_content, reword_text_content, generate_section_content, generate_theme_colors


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    # When TASKMESH_PRELOAD_MODELS=1 (set by the Windows installer), eagerly
    # load the Whisper model at startup. This triggers a one-time download if
    # the model is not yet cached, so the first transcription request is instant.
    if os.getenv("TASKMESH_PRELOAD_MODELS") == "1":
        print("[TaskMesh AI] Pre-loading Whisper model...", flush=True)
        try:
            get_model()
            print("[TaskMesh AI] Whisper model ready.", flush=True)
        except Exception as e:
            print(f"[TaskMesh AI] Whisper model preload failed (non-fatal): {e}", flush=True)
    yield


app = FastAPI(title="Todo AI Service", lifespan=lifespan)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ExtractTasksRequest(BaseModel):
    text: str
    target_individual: Optional[str] = None


class TranscribeRequest(BaseModel):
    filepath: str


class ExtractedTask(BaseModel):
    title: str
    description: Optional[str] = None
    dueDate: Optional[str] = None
    priority: Optional[str] = None


class ExtractTasksResponse(BaseModel):
    tasks: List[ExtractedTask]


class TranscribeResponse(BaseModel):
    transcript: str


class GenerateFieldRequest(BaseModel):
    context: str
    field_name: str
    work_item_type: str
    ai_instructions: str


class GenerateFieldResponse(BaseModel):
    content: str


class ClassifyEmailRequest(BaseModel):
    subject: str
    body: str
    sender: str


class ClassifyEmailResponse(BaseModel):
    classification: str
    task_title: str
    confidence: float


class GenerateReplyRequest(BaseModel):
    email_subject: str
    email_body: str
    email_sender: str
    task_title: str
    task_context: Optional[str] = ""
    template: Optional[str] = ""


class GenerateReplyResponse(BaseModel):
    content: str


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/extract-tasks", response_model=ExtractTasksResponse)
async def extract_tasks(request: ExtractTasksRequest):
    """Extract tasks from text using Ollama LLM."""
    try:
        tasks = await extract_tasks_from_text(request.text, request.target_individual)
        # Convert to Pydantic models
        task_models = []
        for task in tasks:
            task_models.append(ExtractedTask(
                title=task.get("title", ""),
                description=task.get("description"),
                dueDate=task.get("dueDate"),
                priority=task.get("priority")
            ))
        return ExtractTasksResponse(tasks=task_models)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-field", response_model=GenerateFieldResponse)
async def generate_field(request: GenerateFieldRequest):
    """Generate content for an ADO work item field using Ollama LLM."""
    try:
        content = await generate_field_content(
            context=request.context,
            field_name=request.field_name,
            work_item_type=request.work_item_type,
            ai_instructions=request.ai_instructions,
        )
        return GenerateFieldResponse(content=content)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/classify-email", response_model=ClassifyEmailResponse)
async def classify_email(request: ClassifyEmailRequest):
    """Classify an email as task, question, or ignore using Ollama LLM."""
    try:
        result = await classify_email_content(
            subject=request.subject,
            body=request.body,
            sender=request.sender,
        )
        return ClassifyEmailResponse(
            classification=result["classification"],
            task_title=result["task_title"],
            confidence=result["confidence"],
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-reply", response_model=GenerateReplyResponse)
async def generate_reply(request: GenerateReplyRequest):
    """Generate a reply to an email using Ollama LLM."""
    try:
        content = await generate_reply_content(
            email_subject=request.email_subject,
            email_body=request.email_body,
            email_sender=request.email_sender,
            task_title=request.task_title,
            task_context=request.task_context or "",
            template=request.template or "",
        )
        return GenerateReplyResponse(content=content)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class RewordTextRequest(BaseModel):
    text: str
    context: Optional[str] = ""


class RewordTextResponse(BaseModel):
    content: str


class GenerateSectionRequest(BaseModel):
    section_name: str
    row_context: Optional[str] = ""
    document_context: Optional[str] = ""


class GenerateSectionResponse(BaseModel):
    content: str


@app.post("/reword-text", response_model=RewordTextResponse)
async def reword_text(request: RewordTextRequest):
    """Reword text for clarity and readability using Ollama LLM."""
    try:
        content = await reword_text_content(
            text=request.text,
            context=request.context or "",
        )
        return RewordTextResponse(content=content)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate-section", response_model=GenerateSectionResponse)
async def generate_section(request: GenerateSectionRequest):
    """Generate content for a document section using Ollama LLM."""
    try:
        content = await generate_section_content(
            section_name=request.section_name,
            row_context=request.row_context or "",
            document_context=request.document_context or "",
        )
        return GenerateSectionResponse(content=content)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


class GenerateThemeRequest(BaseModel):
    prompt: str


class GenerateThemeResponse(BaseModel):
    isDark: bool
    colors: dict


@app.post("/generate-theme", response_model=GenerateThemeResponse)
async def generate_theme(request: GenerateThemeRequest):
    """Generate a theme color palette from a text description using Ollama LLM."""
    try:
        result = await generate_theme_colors(prompt=request.prompt)
        return GenerateThemeResponse(isDark=result["isDark"], colors=result["colors"])
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(request: TranscribeRequest):
    """Transcribe audio/video file using faster-whisper."""
    try:
        if not os.path.exists(request.filepath):
            raise HTTPException(status_code=404, detail="File not found")

        transcript = transcribe_audio(request.filepath)
        return TranscribeResponse(transcript=transcript)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
