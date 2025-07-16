from rest_framework import serializers
from .models import User


class UserSignUpSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['username', 'email', 'password', 'password2']

    def validate(self, data):
        if data['password'] != data['password2']:
            raise serializers.ValidationError('Passwords do not  match')
        return data

    def create(self, validated_data):
        validated_data.pop('password2')
        user = User.objects.create_user(** validated_data)
        return user
