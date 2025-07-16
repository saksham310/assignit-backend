from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from user.serializers import UserSignUpSerializer,UserLoginInSerializer


class UserSignUpAPIView(APIView):
    permission_classes = [AllowAny,]

    def post(self, request, *args, **kwargs):
        serializer = UserSignUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token = RefreshToken.for_user(user)
        response_data = {
                'refresh': str(token),
                'access': str(token.access_token),
                'user':{
                    'id': user.id,
                    'username': user.username,
                    'email': user.email,
                    'imageUrl': user.image_url,
                }}
        return Response(response_data, status=status.HTTP_201_CREATED)

class UserLoginAPIView(TokenObtainPairView):
    permission_classes = [AllowAny,]
    serializer_class = UserLoginInSerializer