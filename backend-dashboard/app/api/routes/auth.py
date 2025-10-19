from fastapi import APIRouter, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from app.schemas.auth import Token
from app.services.jwt import create_access_token

router = APIRouter()

# Basic demo login. Replace with real user validation.
@router.post("/token", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = None):
    if form_data is None:
        raise HTTPException(status_code=400, detail="Invalid form")
    # Accept any username/password for now (demo only)
    access_token = create_access_token(subject=form_data.username)
    return Token(access_token=access_token)
