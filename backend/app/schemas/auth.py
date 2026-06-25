# this file defines the schemas for the input and output of the main backend API endpoints
from pydantic import BaseModel

# this is the schema for registering a new user, you need a username and a password
class UserRegister(BaseModel):
    username: str
    password: str

# this is the schema for logging in a user, you need a username and a password
class UserLogin(BaseModel):
    username: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ResetPasswordRequest(BaseModel):
    new_password: str

class MessageResponse(BaseModel):
    message: str


# this is the schema for the token response, it includes the access token and the token type
class TokenResponse(BaseModel):
    access_token: str
    token_type: str

# this is the schema for the user response, it include the id and the username
# it is used to return the user information after login or registration
class UserResponse(BaseModel):
    id: int
    username: str
    is_admin: bool
    

    class Config:
        from_attributes = True