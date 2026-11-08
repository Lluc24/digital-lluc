# Build from the repo root so the workspace lock and profile/ are in the context:
#   docker build -f backend/Dockerfile -t lluc24/digital-lluc:<version> .
FROM dailyco/pipecat-base:0.2.12-py3.13

COPY pyproject.toml uv.lock ./
COPY backend/ backend/
RUN pip install --no-cache-dir uv \
    && uv export --frozen --package digital-lluc --extra bot --no-dev --no-emit-workspace --output-file requirements.txt \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir --no-deps ./backend \
    && printf 'from digital_lluc.bot import bot\n\n__all__ = ["bot"]\n' > bot.py

COPY profile/ profile/

ENV DEPLOYMENT=cloud \
    PROFILE_DIR=/app/profile
