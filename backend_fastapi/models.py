from pydantic import BaseModel
from typing import Optional


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str
    confirmPassword: Optional[str] = None
    role: Optional[str] = None
    studentId: Optional[str] = None
    dormRoom: Optional[str] = None
    phone: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class CreateRepairRequest(BaseModel):
    dormBuilding: str
    dormRoom: str
    category: str
    description: str
    priority: str = "normal"
    imageUrl: Optional[str] = None


class PartCreateRequest(BaseModel):
    name: str
    price: float
    stock: int


class PartUpdateRequest(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    stock: Optional[int] = None


class PartUsage(BaseModel):
    partId: str
    quantity: int


class UpdateRepairStatus(BaseModel):
    status: Optional[str] = None
    assignedTo: Optional[str] = None
    adminNote: Optional[str] = None
    workNote: Optional[str] = None
    priority: Optional[str] = None
    partsUsed: Optional[list[PartUsage]] = None


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    studentId: Optional[str] = None
    dormRoom: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    oldPassword: str
    newPassword: str
    confirmNewPassword: str


class AnalyzeRepairRequest(BaseModel):
    description: str


class CreateCommentRequest(BaseModel):
    content: str


class CreateAnnouncementRequest(BaseModel):
    title: str
    content: str


class UpdateSkillsRequest(BaseModel):
    skills: str

class CreateAdminRequest(BaseModel):
    name: str
    email: str
    password: str
    phone: str = ""

class CreateTechnicianRequest(BaseModel):
    name: str
    email: str
    password: str
    skills: str = ""
    phone: str = ""


class AIConfigCreateRequest(BaseModel):
    name: str
    provider: str
    apiKey: Optional[str] = ""
    baseUrl: Optional[str] = ""
    model: Optional[str] = ""
    systemPrompt: Optional[str] = ""
    isActive: Optional[bool] = False


class AIConfigUpdateRequest(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    apiKey: Optional[str] = None
    baseUrl: Optional[str] = None
    model: Optional[str] = None
    systemPrompt: Optional[str] = None
    isActive: Optional[bool] = None


class ChatMessage(BaseModel):
    role: str
    content: str


class AIChatRequest(BaseModel):
    messages: list[ChatMessage]


class CreateReviewRequest(BaseModel):
    requestId: str
    rating: int
    comment: Optional[str] = None


class EvaluateRequest(BaseModel):
    """学生评价请求模型"""
    rating: int
    feedbackTags: Optional[str] = None  # 逗号分隔的标签字符串
    feedbackText: Optional[str] = None
