from django.shortcuts import render

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework import serializers
from rest_framework.pagination import PageNumberPagination
from django.db.models import Count, Max

from orchestrator.models import OrchestratorMessages, CommonMessagesReference
from orchestrator.services import message_handler
from .services import normalize_message_test
from django.http import Http404
from drf_spectacular.utils import extend_schema, OpenApiParameter


class OrchestratorMessagesPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = "page_size"  # client can override ?page_size=
    max_page_size = 100


class OrchestratorMessagesSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrchestratorMessages
        fields = "__all__"
        read_only_fields = ("cd_session", "dt_timestamp")


class CommonMessagesReferenceSerializer(serializers.ModelSerializer):

    class Meta:
        model = CommonMessagesReference
        fields = "__all__"
        read_only_fields = ("cd_id",)  # removing cd_id since it shouldnt be editable


class SessionListSerializer(serializers.Serializer):
    cd_session = serializers.IntegerField()
    ds_channel_name = serializers.CharField()
    ds_id_channel_user = serializers.CharField(allow_null=True)
    dt_last_message = serializers.DateTimeField()
    ds_last_text = serializers.CharField(allow_blank=True, allow_null=True)
    ds_last_platform_user = serializers.CharField(allow_null=True)
    cd_last_message_id = serializers.IntegerField()
    total_messages = serializers.IntegerField()


def _get_value(data, preferred_key, legacy_key):
    value = data.get(preferred_key)
    if value is None:
        value = data.get(legacy_key)
    return value


class Messages(APIView):
    serializer_class = OrchestratorMessagesSerializer
    pagination_class = OrchestratorMessagesPagination

    @extend_schema(
        parameters=[
            OpenApiParameter(
                name="client_id",
                type=str,
                location=OpenApiParameter.QUERY,
                description="Filter messages by client_id",
            ),
            OpenApiParameter(
                name="session_id",
                type=int,
                location=OpenApiParameter.QUERY,
                description="Filter messages by session_id",
            ),
            OpenApiParameter(
                name="page_size",
                type=int,
                location=OpenApiParameter.QUERY,
                description="Set amount of messages per request (max = 100)",
            ),
            OpenApiParameter(
                name="channel_name",
                type=str,
                location=OpenApiParameter.QUERY,
                description="Filter messages by channel_name",
            ),
            OpenApiParameter(
                name="platform_user_id",
                type=str,
                location=OpenApiParameter.QUERY,
                description="Filter messages by platform_user_id",
            ),
        ]
    )
    def get(self, request, *args, **kwargs):
        """
        Fetch all messages with pagination and optional
        """
        try:
            queryset = OrchestratorMessages.objects.all().order_by("-cd_id")

            # checkin for query params
            client_id = request.query_params.get("client_id")
            session_id = request.query_params.get("session_id")
            channel_name = request.query_params.get("channel_name")
            platform_user_id = request.query_params.get("platform_user_id")
            if client_id:
                queryset = queryset.filter(ds_id_channel_user=client_id)

            if session_id:
                queryset = queryset.filter(cd_session=session_id)

            if channel_name:
                queryset = queryset.filter(ds_channel_name=channel_name)

            if platform_user_id:
                queryset = queryset.filter(ds_id_platform_user=platform_user_id)

            paginator = self.pagination_class()
            paginated_qs = paginator.paginate_queryset(queryset, request)

            serializer = OrchestratorMessagesSerializer(paginated_qs, many=True)

            return paginator.get_paginated_response(serializer.data)

        except Exception as e:
            return Response(
                {"error": f"Error fetching messages: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def post(self, request, *args, **kwargs):
        """
        Post a message with your attendant id, to a specific user on a specific channel, this message works like a integration and goes to redis first
        """
        platform_user_id = _get_value(
            request.data, "ds_id_platform_user", "platform_user_id"
        )
        channel_user_id = _get_value(
            request.data, "ds_id_channel_user", "channel_user_id"
        )
        message = _get_value(request.data, "ds_text", "message")
        channel_name = _get_value(request.data, "ds_channel_name", "channel_name")
        print(platform_user_id, channel_user_id, message, channel_name)
        if (
            not platform_user_id
            or not channel_user_id
            or not message
            or not channel_name
        ):
            return Response(
                {"error": "Missing fields..."},
                status.HTTP_400_BAD_REQUEST,
            )

        response_temp = message_handler(
            platform_user_id, channel_user_id, channel_name, message
        )

        return Response(response_temp, status=status.HTTP_200_OK)


class Sessions(APIView):
    pagination_class = OrchestratorMessagesPagination

    @extend_schema(
        responses=SessionListSerializer(many=True),
        parameters=[
            OpenApiParameter(
                name="channel_name",
                type=str,
                location=OpenApiParameter.QUERY,
                description="Filter sessions by channel_name",
            ),
            OpenApiParameter(
                name="client_id",
                type=str,
                location=OpenApiParameter.QUERY,
                description="Filter sessions by ds_id_channel_user",
            ),
            OpenApiParameter(
                name="page_size",
                type=int,
                location=OpenApiParameter.QUERY,
                description="Set amount of sessions per request (max = 100)",
            ),
        ],
    )
    def get(self, request, *args, **kwargs):
        try:
            queryset = OrchestratorMessages.objects.all()
            channel_name = request.query_params.get("channel_name")
            client_id = request.query_params.get("client_id")

            if channel_name:
                queryset = queryset.filter(ds_channel_name=channel_name)

            if client_id:
                queryset = queryset.filter(ds_id_channel_user=client_id)

            grouped = (
                queryset.values("cd_session", "ds_channel_name", "ds_id_channel_user")
                .annotate(
                    dt_last_message=Max("dt_timestamp"),
                    cd_last_message_id=Max("cd_id"),
                    total_messages=Count("cd_id"),
                )
                .order_by("-dt_last_message", "-cd_last_message_id")
            )

            paginator = self.pagination_class()
            paginated_groups = paginator.paginate_queryset(grouped, request)

            last_message_ids = [
                item["cd_last_message_id"]
                for item in paginated_groups
                if item.get("cd_last_message_id")
            ]
            last_messages_map = OrchestratorMessages.objects.in_bulk(last_message_ids)

            response_payload = []
            for item in paginated_groups:
                last_message = last_messages_map.get(item["cd_last_message_id"])
                response_payload.append(
                    {
                        "cd_session": item["cd_session"],
                        "ds_channel_name": item["ds_channel_name"],
                        "ds_id_channel_user": item["ds_id_channel_user"],
                        "dt_last_message": item["dt_last_message"],
                        "ds_last_text": last_message.ds_text if last_message else None,
                        "ds_last_platform_user": (
                            last_message.ds_id_platform_user if last_message else None
                        ),
                        "cd_last_message_id": item["cd_last_message_id"],
                        "total_messages": item["total_messages"],
                    }
                )

            serializer = SessionListSerializer(response_payload, many=True)
            return paginator.get_paginated_response(serializer.data)
        except Exception as e:
            return Response(
                {"error": f"Error fetching sessions: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


# crud for cached terms
class CommonMessagesList(APIView):
    serializer_class = CommonMessagesReferenceSerializer

    def get(self, request, id=None, format=None):
        """
        Fetch all common cached messages
        """
        try:
            if id:
                # Retrieve a single message
                message = self.get_object(id)
                serializer = CommonMessagesReferenceSerializer(message)
                return Response(serializer.data, status=status.HTTP_200_OK)
            else:
                # Retrieve all messages
                queryset = CommonMessagesReference.objects.all().order_by("cd_id")
                serializer = CommonMessagesReferenceSerializer(queryset, many=True)
                return Response(serializer.data, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status.HTTP_404_NOT_FOUND,
            )

    def post(self, request, format=None):
        """
        Create a new cached message given the reference and the response, the reference message is normalized for better triggering
        """
        serializer = CommonMessagesReferenceSerializer(data=request.data)

        if serializer.is_valid():
            validated_data = serializer.validated_data

            print("is valid", validated_data["ds_message"])
            treated_message = normalize_message_test(validated_data["ds_message"])
            print("is treated", treated_message)
            if not treated_message.strip():
                return Response(
                    {"error": "Normalization error"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer.save(ds_message=treated_message)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(
            {"error": str(serializer.errors)}, status=status.HTTP_400_BAD_REQUEST
        )


class CommonMessagesIdentified(APIView):

    serializer_class = CommonMessagesReferenceSerializer

    def get_object(self, id):
        try:
            return CommonMessagesReference.objects.get(pk=id)
        except CommonMessagesReference.DoesNotExist:
            raise Http404("Message not found")

    def put(self, request, id, format=None):
        """
        Update cached message based on the id, the reference message is normalized for better triggering
        """
        message = self.get_object(id)
        serializer = CommonMessagesReferenceSerializer(message, data=request.data)

        if serializer.is_valid():
            validated_data = serializer.validated_data
            treated_message = normalize_message_test(validated_data["ds_message"])

            if not treated_message.strip():
                return Response(
                    {"error": "A mensagem não pode ser vazia após normalização."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            serializer.save(ds_message=treated_message)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, id, format=None):
        """
        Delete cached message based on the id
        """
        try:
            message = self.get_object(id)
            message.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status.HTTP_404_NOT_FOUND,
            )
