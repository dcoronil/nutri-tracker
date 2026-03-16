from datetime import UTC, datetime, timedelta

from app.models import BodyWeightLog, Sex, UserProfile
from app.services.body_metrics import bmi, bmi_category, body_fat_percent, coach_hints, weekly_weight_change


def test_bmi_calculation_and_category():
    result = bmi(80, 180)
    assert result == 24.69

    label, color = bmi_category(result)
    assert label == "normal"
    assert color


def test_body_fat_us_navy_male_example():
    profile = UserProfile(
        user_id=1,
        weight_kg=80,
        height_cm=180,
        sex=Sex.male,
        waist_cm=90,
        neck_cm=40,
    )

    result = body_fat_percent(profile)
    assert result is not None
    assert abs(result - 11.96) < 0.2


def test_body_fat_us_navy_female_example():
    profile = UserProfile(
        user_id=2,
        weight_kg=65,
        height_cm=165,
        sex=Sex.female,
        waist_cm=90,
        neck_cm=33,
        hip_cm=102,
    )

    result = body_fat_percent(profile)
    assert result is not None
    assert abs(result - 13.69) < 0.2


def test_body_fat_requires_measurements():
    profile = UserProfile(
        user_id=3,
        weight_kg=77,
        height_cm=179,
        sex=Sex.male,
    )

    assert body_fat_percent(profile) is None


def test_weekly_weight_change():
    now = datetime.now(UTC)
    logs = [
        BodyWeightLog(user_id=1, weight_kg=80.2, created_at=now - timedelta(days=13)),
        BodyWeightLog(user_id=1, weight_kg=80.0, created_at=now - timedelta(days=10)),
        BodyWeightLog(user_id=1, weight_kg=79.4, created_at=now - timedelta(days=6)),
        BodyWeightLog(user_id=1, weight_kg=79.2, created_at=now - timedelta(days=2)),
    ]

    delta = weekly_weight_change(logs, now=now)
    assert delta is not None
    assert delta < 0


def test_coach_hints_rules():
    hints = coach_hints(
        consumed_kcal=2600,
        kcal_goal=2000,
        consumed_protein_g=70,
        protein_goal=140,
        has_intakes_today=False,
        current_time=datetime.now(UTC).replace(hour=20),
        weekly_weight_delta=-1.2,
        latest_weight_kg=75,
    )
    assert len(hints) >= 3
