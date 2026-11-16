"""内部接口的请求模型，字段与 Java 业务服务的入参保持一致（camelCase）。"""

from pydantic import BaseModel, Field


class AgentSpec(BaseModel):
    id: str = ""
    name: str = ""
    role: str = ""
    systemPrompt: str = ""
    temperature: float = 0.3
    tools: list[str] = Field(default_factory=list)


class ModelSpec(BaseModel):
    id: str = ""
    label: str = ""
    modelName: str = ""
    baseUrl: str = ""
    apiKey: str = ""


class ChatTurn(BaseModel):
    role: str
    content: str


class AgentRunRequest(BaseModel):
    conversationId: str = ""
    agent: AgentSpec = Field(default_factory=AgentSpec)
    model: ModelSpec = Field(default_factory=ModelSpec)
    messages: list[ChatTurn] = Field(default_factory=list)


class TeamMemberSpec(BaseModel):
    id: str = ""
    name: str = ""
    role: str = ""
    systemPrompt: str = ""
    temperature: float = 0.3
    tools: list[str] = Field(default_factory=list)
    model: ModelSpec = Field(default_factory=ModelSpec)


class TeamRunRequest(BaseModel):
    runId: str = ""
    mode: str = "sequential"
    prompt: str = ""
    team: list[TeamMemberSpec] = Field(default_factory=list)
    controlUrl: str = ""


class ProjectBuildRequest(BaseModel):
    buildId: str = ""
    projectId: str = ""
    projectName: str = ""
    stack: str = "java-react"
    requirement: str = ""
    workspace: str = ""
    team: list[TeamMemberSpec] = Field(default_factory=list)
    controlUrl: str = ""
