FROM python:3.11-slim

# Install system dependencies for OpenCV + pandoc
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install pandoc >= 3.0 từ GitHub releases (bản apt thường quá cũ)
# Kiểm tra version mới nhất tại: https://github.com/jgm/pandoc/releases
ARG PANDOC_VERSION=3.6.4
RUN wget -q "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-amd64.tar.gz" \
    -O /tmp/pandoc.tar.gz \
    && tar -xzf /tmp/pandoc.tar.gz -C /tmp \
    && mv /tmp/pandoc-${PANDOC_VERSION}/bin/pandoc /usr/local/bin/pandoc \
    && rm -rf /tmp/pandoc* \
    && pandoc --version

WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .
COPY omr_engine.py .

# Expose port
EXPOSE 8000

# Start server using the PORT environment variable (Render sets this dynamically, usually to 10000)
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
