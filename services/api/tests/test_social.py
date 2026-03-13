import io
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from PIL import Image
from sqlmodel import Session, select

from app.models import SocialPost, SocialPostMedia

def _create_verified_user(client, username_prefix: str) -> dict[str, object]:
    email = f"{username_prefix}-{uuid4().hex[:8]}@example.com"
    username = f"{username_prefix}_{uuid4().hex[:8]}"
    register_response = client.post(
        "/auth/register",
        json={
            "username": username,
            "email": email,
            "password": "supersecret123",
            "sex": "male",
            "birth_date": "1994-01-10",
        },
    )
    assert register_response.status_code == 200
    code = register_response.json()["debug_verification_code"]

    verify_response = client.post("/auth/verify", json={"email": email, "code": code})
    assert verify_response.status_code == 200
    token = verify_response.json()["access_token"]
    return {
        "email": email,
        "username": username,
        "headers": {"Authorization": f"Bearer {token}"},
        "user": verify_response.json()["user"],
    }


def _create_progress_post(client, headers, *, visibility: str = "friends", caption: str = "post", weight_kg: float | None = None):
    response = client.post(
        "/social/posts",
        headers=headers,
        data={
            "type": "progress",
            "visibility": visibility,
            "caption": caption,
            "progress_weight_kg": str(weight_kg) if weight_kg is not None else "",
        },
    )
    assert response.status_code == 200
    return response.json()


def _create_recipe_post(client, headers, *, visibility: str = "friends", caption: str = "recipe-post"):
    image = Image.new("RGB", (128, 128), color=(210, 140, 80))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    buffer.seek(0)
    response = client.post(
        "/social/posts",
        headers=headers,
        data={
            "type": "recipe",
            "visibility": visibility,
            "caption": caption,
            "recipe_title": "Tortitas",
            "recipe_ingredients_json": '["avena","huevo"]',
            "recipe_steps_json": '["mezclar","cocinar"]',
            "recipe_tags_json": '["breakfast"]',
            "recipe_nutrition_kcal": "420",
            "recipe_nutrition_protein_g": "28",
            "recipe_nutrition_carbs_g": "39",
            "recipe_nutrition_fat_g": "14",
        },
        files={"photos": ("recipe.jpg", buffer.getvalue(), "image/jpeg")},
    )
    assert response.status_code == 200
    return response.json()


def test_social_user_search_returns_other_verified_users(client, auth_headers):
    second_user = _create_verified_user(client, "friend")

    response = client.get("/social/users/search?q=friend", headers=auth_headers)
    assert response.status_code == 200
    items = response.json()["items"]
    assert any(item["username"] == second_user["username"] for item in items)


def test_profile_avatar_upload_is_returned_in_social_search(client, auth_headers):
    second_user = _create_verified_user(client, "avatar")

    image = Image.new("RGB", (128, 128), color=(25, 185, 160))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    buffer.seek(0)

    upload_response = client.post(
        "/me/avatar",
        headers=second_user["headers"],
        files={"photo": ("avatar.jpg", buffer.getvalue(), "image/jpeg")},
    )
    assert upload_response.status_code == 200
    assert upload_response.json()["avatar_url"]

    response = client.get(f"/social/users/search?q={second_user['username']}", headers=auth_headers)
    assert response.status_code == 200
    items = response.json()["items"]
    assert items
    assert items[0]["avatar_url"]


def test_social_post_media_uses_relative_storage_and_current_public_base_url(client, auth_headers, engine):
    recipe_post = _create_recipe_post(client, auth_headers, caption="media-url-check")

    with Session(engine) as session:
        media_row = session.exec(select(SocialPostMedia).where(SocialPostMedia.post_id == recipe_post["id"])).first()
        assert media_row is not None
        assert media_row.media_url == f"{recipe_post['id']}/social_1.jpg"
        media_row.media_url = f"http://localhost:8000/media/{recipe_post['id']}/social_1.jpg"
        session.add(media_row)
        session.commit()

    feed_response = client.get("/social/feed?limit=10", headers=auth_headers)
    assert feed_response.status_code == 200
    item = next(post for post in feed_response.json()["items"] if post["id"] == recipe_post["id"])
    assert item["media"][0]["media_url"] == f"http://testserver/media/{recipe_post['id']}/social_1.jpg"


def test_social_post_media_missing_file_is_hidden_from_feed(client, auth_headers, engine):
    recipe_post = _create_recipe_post(client, auth_headers, caption="missing-media-check")

    with Session(engine) as session:
        media_row = session.exec(select(SocialPostMedia).where(SocialPostMedia.post_id == recipe_post["id"])).first()
        assert media_row is not None
        media_row.media_url = f"{recipe_post['id']}/missing.jpg"
        session.add(media_row)
        session.commit()

    feed_response = client.get("/social/feed?limit=10", headers=auth_headers)
    assert feed_response.status_code == 200
    item = next(post for post in feed_response.json()["items"] if post["id"] == recipe_post["id"])
    assert item["media"] == []


def test_friend_request_send_accept_and_friends_list(client, auth_headers):
    second_user = _create_verified_user(client, "buddy")

    send_response = client.post(
        "/social/friends/request",
        headers=auth_headers,
        json={"to_user_identifier": second_user["username"]},
    )
    assert send_response.status_code == 200
    request_id = send_response.json()["id"]
    assert send_response.json()["status"] == "pending"

    requests_for_receiver = client.get("/social/friends/requests", headers=second_user["headers"])
    assert requests_for_receiver.status_code == 200
    assert len(requests_for_receiver.json()["incoming_requests"]) == 1

    accept_response = client.post(f"/social/friends/requests/{request_id}/accept", headers=second_user["headers"])
    assert accept_response.status_code == 200
    assert accept_response.json()["status"] == "accepted"

    first_friends = client.get("/social/friends", headers=auth_headers)
    second_friends = client.get("/social/friends", headers=second_user["headers"])
    assert first_friends.status_code == 200
    assert second_friends.status_code == 200
    assert len(first_friends.json()) == 1
    assert len(second_friends.json()) == 1
    assert first_friends.json()[0]["username"] == second_user["username"]


def test_reject_friend_request(client, auth_headers):
    second_user = _create_verified_user(client, "rejector")

    send_response = client.post(
        "/social/friends/request",
        headers=auth_headers,
        json={"to_user_identifier": second_user["username"]},
    )
    assert send_response.status_code == 200
    request_id = send_response.json()["id"]

    reject_response = client.post(f"/social/friends/requests/{request_id}/reject", headers=second_user["headers"])
    assert reject_response.status_code == 200
    assert reject_response.json()["status"] == "rejected"


def test_social_feed_orders_friends_before_public_and_respects_visibility(client, auth_headers):
    friend_user = _create_verified_user(client, "feedfriend")
    public_user = _create_verified_user(client, "feedpublic")

    send_response = client.post(
        "/social/friends/request",
        headers=auth_headers,
        json={"to_user_identifier": friend_user["username"]},
    )
    assert send_response.status_code == 200
    request_id = send_response.json()["id"]
    accept_response = client.post(f"/social/friends/requests/{request_id}/accept", headers=friend_user["headers"])
    assert accept_response.status_code == 200

    _create_progress_post(client, friend_user["headers"], visibility="friends", caption="friend-post", weight_kg=81)
    _create_progress_post(client, public_user["headers"], visibility="public", caption="public-post", weight_kg=75)
    _create_progress_post(client, public_user["headers"], visibility="private", caption="private-post", weight_kg=74)

    feed_response = client.get("/social/feed?limit=10", headers=auth_headers)
    assert feed_response.status_code == 200
    items = feed_response.json()["items"]
    captions = [item["caption"] for item in items]
    assert "friend-post" in captions
    assert "public-post" in captions
    assert "private-post" not in captions
    assert captions.index("friend-post") < captions.index("public-post")
    sources = {item["caption"]: item["source"] for item in items}
    assert sources["friend-post"] == "friends"
    assert sources["public-post"] == "explore"

    explore_response = client.get("/social/feed?scope=explore&limit=10", headers=auth_headers)
    assert explore_response.status_code == 200
    explore_captions = [item["caption"] for item in explore_response.json()["items"]]
    assert "public-post" in explore_captions
    assert "friend-post" not in explore_captions


def test_social_profile_visibility_and_like_comment_flow(client, auth_headers):
    other_user = _create_verified_user(client, "profile")
    public_post = _create_progress_post(client, other_user["headers"], visibility="public", caption="public-profile-post", weight_kg=79)
    _create_progress_post(client, other_user["headers"], visibility="private", caption="private-profile-post", weight_kg=78)

    profile_response = client.get(f"/social/users/{other_user['user']['id']}/posts", headers=auth_headers)
    assert profile_response.status_code == 200
    captions = [item["caption"] for item in profile_response.json()["items"]]
    assert "public-profile-post" in captions
    assert "private-profile-post" not in captions

    like_response = client.post(f"/social/posts/{public_post['id']}/like", headers=auth_headers)
    assert like_response.status_code == 200
    assert like_response.json()["liked"] is True
    assert like_response.json()["like_count"] == 1

    comment_response = client.post(
        f"/social/posts/{public_post['id']}/comments",
        headers=auth_headers,
        json={"text": "Buen progreso"},
    )
    assert comment_response.status_code == 200
    assert comment_response.json()["text"] == "Buen progreso"

    comments_response = client.get(f"/social/posts/{public_post['id']}/comments", headers=auth_headers)
    assert comments_response.status_code == 200
    assert len(comments_response.json()) == 1
    assert comments_response.json()[0]["text"] == "Buen progreso"


def test_social_feed_cursor_pagination(client, auth_headers):
    other_user = _create_verified_user(client, "cursor")
    for index in range(3):
        _create_progress_post(client, other_user["headers"], visibility="public", caption=f"cursor-{index}", weight_kg=70 + index)

    page_1 = client.get("/social/feed?scope=explore&limit=2", headers=auth_headers)
    assert page_1.status_code == 200
    body_1 = page_1.json()
    assert len(body_1["items"]) == 2
    assert body_1["next_cursor"]

    page_2 = client.get(f"/social/feed?scope=explore&limit=2&cursor={body_1['next_cursor']}", headers=auth_headers)
    assert page_2.status_code == 200
    body_2 = page_2.json()
    assert len(body_2["items"]) >= 1
    assert body_1["items"][0]["id"] != body_2["items"][0]["id"]


def test_recipe_post_requires_all_macro_fields(client, auth_headers):
    image = Image.new("RGB", (128, 128), color=(210, 140, 80))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    buffer.seek(0)
    response = client.post(
        "/social/posts",
        headers=auth_headers,
        data={
            "type": "recipe",
            "visibility": "friends",
            "recipe_title": "Receta incompleta",
            "recipe_ingredients_json": '["avena"]',
            "recipe_steps_json": '["mezclar"]',
            "recipe_nutrition_kcal": "420",
            "recipe_nutrition_protein_g": "28",
            "recipe_nutrition_carbs_g": "39",
        },
        files={"photos": ("recipe.jpg", buffer.getvalue(), "image/jpeg")},
    )
    assert response.status_code == 422
    assert "hidratos y grasas" in response.json()["detail"]


def test_owner_can_update_visibility_and_delete_social_post(client, auth_headers):
    recipe_post = _create_recipe_post(client, auth_headers, visibility="public")

    update_response = client.patch(
        f"/social/posts/{recipe_post['id']}",
        headers=auth_headers,
        json={"visibility": "private"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["visibility"] == "private"

    delete_response = client.delete(f"/social/posts/{recipe_post['id']}", headers=auth_headers)
    assert delete_response.status_code == 200
    assert delete_response.json()["deleted"] is True

    me_posts_response = client.get("/social/me/posts", headers=auth_headers)
    assert me_posts_response.status_code == 200
    assert recipe_post["id"] not in {item["id"] for item in me_posts_response.json()["items"]}


def test_social_feed_supports_sort_and_type_filters(client, auth_headers, engine):
    friend_user = _create_verified_user(client, "sortfriend")
    public_user = _create_verified_user(client, "sortpublic")

    send_response = client.post(
        "/social/friends/request",
        headers=auth_headers,
        json={"to_user_identifier": friend_user["username"]},
    )
    assert send_response.status_code == 200
    request_id = send_response.json()["id"]
    accept_response = client.post(f"/social/friends/requests/{request_id}/accept", headers=friend_user["headers"])
    assert accept_response.status_code == 200

    friend_post = _create_progress_post(client, friend_user["headers"], visibility="friends", caption="friend-relevance", weight_kg=80)
    public_post = _create_progress_post(client, public_user["headers"], visibility="public", caption="public-recent", weight_kg=72)
    recipe_post = _create_recipe_post(client, public_user["headers"], visibility="public", caption="public-recipe")

    with Session(engine) as session:
        friend_row = session.get(SocialPost, friend_post["id"])
        public_row = session.get(SocialPost, public_post["id"])
        recipe_row = session.get(SocialPost, recipe_post["id"])
        assert friend_row and public_row and recipe_row
        now = datetime.now(UTC)
        friend_row.created_at = now - timedelta(hours=2)
        public_row.created_at = now - timedelta(hours=1)
        recipe_row.created_at = now
        session.add(friend_row)
        session.add(public_row)
        session.add(recipe_row)
        session.commit()

    relevance_response = client.get("/social/feed?limit=10&sort=relevance", headers=auth_headers)
    assert relevance_response.status_code == 200
    relevance_captions = [item["caption"] for item in relevance_response.json()["items"]]
    assert relevance_captions.index("friend-relevance") < relevance_captions.index("public-recent")

    recent_response = client.get("/social/feed?limit=10&sort=recent", headers=auth_headers)
    assert recent_response.status_code == 200
    recent_captions = [item["caption"] for item in recent_response.json()["items"]]
    assert recent_captions.index("public-recent") < recent_captions.index("friend-relevance")

    recipe_filter_response = client.get("/social/feed?scope=explore&limit=10&post_type=recipe", headers=auth_headers)
    assert recipe_filter_response.status_code == 200
    recipe_items = recipe_filter_response.json()["items"]
    assert recipe_items
    assert all(item["type"] == "recipe" for item in recipe_items)
    assert {item["caption"] for item in recipe_items} == {"public-recipe"}
