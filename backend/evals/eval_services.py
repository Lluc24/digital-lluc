"""The services `pipecat eval` builds from the scenarios' `factory:` paths: OpenAI judges,
Cartesia speaks the visitor's turns, Deepgram transcribes the bot's speech."""

from collections.abc import Mapping

from pipecat.services.cartesia.tts import CartesiaHttpTTSService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.openai.llm import OpenAILLMService
from pydantic import BaseModel, ConfigDict, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class _EvalSettings(BaseSettings):
    model_config = SettingsConfigDict(hide_input_in_errors=True, env_ignore_empty=True)

    openai_api_key: SecretStr
    deepgram_api_key: SecretStr
    cartesia_api_key: SecretStr


class _JudgeConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    model: str = Field(min_length=1)


class _VoiceConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    voice: str = Field(min_length=1)


def judge(config: Mapping[str, object]) -> OpenAILLMService:
    return OpenAILLMService(
        api_key=_EvalSettings().openai_api_key.get_secret_value(),
        settings=OpenAILLMService.Settings(model=_JudgeConfig.model_validate(config).model),
    )


def visitor_voice(config: Mapping[str, object]) -> CartesiaHttpTTSService:
    return CartesiaHttpTTSService(
        api_key=_EvalSettings().cartesia_api_key.get_secret_value(),
        settings=CartesiaHttpTTSService.Settings(voice=_VoiceConfig.model_validate(config).voice),
    )


def bot_transcriber(_config: Mapping[str, object]) -> DeepgramSTTService:
    return DeepgramSTTService(api_key=_EvalSettings().deepgram_api_key.get_secret_value())
