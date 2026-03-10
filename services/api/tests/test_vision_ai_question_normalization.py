from app.services.vision_ai import _coerce_question_items


def test_sauce_type_question_is_not_forced_to_yes_no() -> None:
    items = _coerce_question_items(
        [
            {
                "id": "q_sauce",
                "prompt": "¿Qué tipo de salsa se usa en la pasta?",
                "answer_type": "single_choice",
                "options": ["yes", "no"],
            }
        ],
        locale="es",
    )

    assert len(items) == 1
    item = items[0]
    assert item["answer_type"] == "text"
    assert item["options"] == []
    assert item["placeholder"] == "Respuesta breve"


def test_quantity_question_is_clear_and_about_full_plate() -> None:
    items = _coerce_question_items(
        [
            {
                "id": "q_qty",
                "prompt": "¿Cantidad aproximada?",
                "answer_type": "text",
                "options": [],
            }
        ],
        locale="es",
    )

    assert len(items) == 1
    item = items[0]
    assert item["id"] == "quantity_note"
    assert item["answer_type"] == "number"
    assert item["prompt"] == "¿Cuántos gramos del plato completo consumiste aproximadamente?"
    assert item["placeholder"] == "Ej: 350"


def test_added_fats_presence_question_keeps_yes_no_spanish() -> None:
    items = _coerce_question_items(
        [
            {
                "id": "q_fats",
                "prompt": "¿Llevaba aceite o salsas añadidas?",
                "answer_type": "text",
                "options": [],
            }
        ],
        locale="es",
    )

    assert len(items) == 1
    item = items[0]
    assert item["id"] == "added_fats"
    assert item["answer_type"] == "single_choice"
    assert item["options"] == ["Sí", "No"]


def test_portion_options_are_spanish_and_capitalized() -> None:
    items = _coerce_question_items(
        [
            {
                "id": "q_portion",
                "prompt": "¿Qué tamaño tenía la ración?",
                "answer_type": "single_choice",
                "options": ["small", "medium", "large"],
            }
        ],
        locale="es",
    )

    assert len(items) == 1
    item = items[0]
    assert item["id"] == "portion_size"
    assert item["options"] == ["Pequeña", "Mediana", "Grande"]
