from django.urls import path
from .views import UserSignUpAPIView, UserLoginAPIView

urlpatterns = [
    path('register',UserSignUpAPIView.as_view(),name='register'),
    path('login',UserLoginAPIView.as_view(),name='login'),
]