FROM python:3.11-slim

COPY core/fixtures/repo_schemes /app
WORKDIR /app
RUN pip install --no-cache-dir -r requirements.txt

COPY sandbox/polygraph_shim/sitecustomize.py /usr/local/lib/python3.11/site-packages/sitecustomize.py
COPY sandbox/runner.py /runner.py

ENTRYPOINT ["python", "/runner.py"]
