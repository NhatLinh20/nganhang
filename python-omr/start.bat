@echo off
echo Starting Python OMR Microservice...
call venv\Scripts\activate
uvicorn main:app --reload
pause
