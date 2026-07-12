# Build from the repo root so profile/ is in the context:
#   docker build -f bot/Dockerfile -t digital-lluc .
FROM dailyco/pipecat-base:latest

COPY bot/pyproject.toml bot/uv.lock ./
RUN pip install --no-cache-dir uv \
    && uv export --frozen --no-emit-project --output-file requirements.txt \
    && pip install --no-cache-dir -r requirements.txt

COPY bot/bot.py bot.py
COPY bot/persona/ persona/
COPY profile/ profile/

ENV PROFILE_DIR=/app/profile
