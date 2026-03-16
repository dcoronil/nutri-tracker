from __future__ import annotations

from dataclasses import dataclass

from app.models import NutritionBasis


@dataclass(frozen=True, slots=True)
class GenericFoodEntry:
    slug: str
    name: str
    kcal: float
    protein_g: float
    fat_g: float
    carbs_g: float
    aliases: tuple[str, ...] = ()
    nutrition_basis: NutritionBasis = NutritionBasis.per_100g
    sat_fat_g: float | None = None
    sugars_g: float | None = None
    fiber_g: float | None = None
    salt_g: float | None = None
    serving_size_g: float | None = None
    net_weight_g: float | None = None


def _food(
    slug: str,
    name: str,
    kcal: float,
    protein_g: float,
    fat_g: float,
    carbs_g: float,
    *,
    aliases: tuple[str, ...] = (),
    nutrition_basis: NutritionBasis = NutritionBasis.per_100g,
    sat_fat_g: float | None = None,
    sugars_g: float | None = None,
    fiber_g: float | None = None,
    salt_g: float | None = None,
    serving_size_g: float | None = None,
    net_weight_g: float | None = None,
) -> GenericFoodEntry:
    return GenericFoodEntry(
        slug=slug,
        name=name,
        kcal=kcal,
        protein_g=protein_g,
        fat_g=fat_g,
        carbs_g=carbs_g,
        aliases=aliases,
        nutrition_basis=nutrition_basis,
        sat_fat_g=sat_fat_g,
        sugars_g=sugars_g,
        fiber_g=fiber_g,
        salt_g=salt_g,
        serving_size_g=serving_size_g,
        net_weight_g=net_weight_g,
    )


GENERIC_FOODS: tuple[GenericFoodEntry, ...] = (
    _food("pan_blanco", "Pan blanco", 265, 8.5, 3.2, 49.0, aliases=("pan", "barra de pan", "pan comun"), fiber_g=2.7, salt_g=1.1),
    _food("pan_integral", "Pan integral", 247, 9.0, 3.4, 41.0, aliases=("pan integral", "pan de trigo integral"), fiber_g=6.8, salt_g=1.0),
    _food("pan_molde", "Pan de molde", 255, 8.0, 3.6, 47.0, aliases=("pan bimbo", "pan sandwich", "pan tostado"), fiber_g=3.1, salt_g=1.0),
    _food("pan_centeno", "Pan de centeno", 259, 8.5, 3.3, 48.3, aliases=("pan negro", "pan de centeno integral"), fiber_g=5.8, salt_g=1.0),
    _food("pan_pita", "Pan pita", 275, 9.1, 1.2, 55.7, aliases=("pita", "pan arabe"), fiber_g=2.2, salt_g=1.0),
    _food("pan_hamburguesa", "Pan de hamburguesa", 272, 9.4, 4.8, 46.0, aliases=("bollo de hamburguesa", "pan burger"), fiber_g=2.4, salt_g=1.1),
    _food("pan_hotdog", "Pan de hot dog", 279, 8.7, 4.2, 49.5, aliases=("pan perrito", "pan de perrito"), fiber_g=2.0, salt_g=1.1),
    _food("tortilla_trigo", "Tortilla de trigo", 310, 8.0, 7.5, 50.0, aliases=("wrap trigo", "fajita trigo"), fiber_g=3.2, salt_g=1.2),
    _food("tortilla_maiz", "Tortilla de maiz", 218, 5.7, 2.9, 44.6, aliases=("wrap maiz", "taco maiz"), fiber_g=6.3, salt_g=0.9),
    _food("arroz_blanco_cocido", "Arroz blanco cocido", 130, 2.7, 0.3, 28.2, aliases=("arroz", "arroz blanco", "arroz hervido"), fiber_g=0.4, salt_g=0.0),
    _food("arroz_integral_cocido", "Arroz integral cocido", 123, 2.7, 1.0, 25.6, aliases=("arroz integral", "arroz integral hervido"), fiber_g=1.8, salt_g=0.0),
    _food("arroz_basmati_cocido", "Arroz basmati cocido", 121, 3.5, 0.4, 25.0, aliases=("basmati", "arroz basmati"), fiber_g=0.7, salt_g=0.0),
    _food("arroz_jazmin_cocido", "Arroz jazmin cocido", 129, 2.6, 0.3, 28.2, aliases=("jazmin", "arroz jazmin"), fiber_g=0.4, salt_g=0.0),
    _food("quinoa_cocida", "Quinoa cocida", 120, 4.4, 1.9, 21.3, aliases=("quinoa",), fiber_g=2.8, salt_g=0.0),
    _food("avena_hojuelas", "Avena", 389, 16.9, 6.9, 66.3, aliases=("copos de avena", "avena en hojuelas"), fiber_g=10.6, salt_g=0.0),
    _food("muesli", "Muesli", 360, 10.5, 5.5, 64.0, aliases=("cereales muesli",), fiber_g=7.0, salt_g=0.2),
    _food("pasta_cocida", "Pasta cocida", 157, 5.8, 0.9, 30.9, aliases=("pasta", "macarrones cocidos", "espaguetis cocidos"), fiber_g=1.8, salt_g=0.0),
    _food("macarrones_cocidos", "Macarrones cocidos", 158, 5.6, 0.9, 31.0, aliases=("macarrones",), fiber_g=1.8, salt_g=0.0),
    _food("espaguetis_cocidos", "Espaguetis cocidos", 158, 5.8, 0.9, 30.9, aliases=("espaguetis", "spaghetti"), fiber_g=1.8, salt_g=0.0),
    _food("cuscus_cocido", "Cuscus cocido", 112, 3.8, 0.2, 23.2, aliases=("cous cous", "cuscus"), fiber_g=1.4, salt_g=0.0),
    _food("patata_cocida", "Patata cocida", 87, 1.9, 0.1, 20.1, aliases=("patata hervida", "papa cocida"), fiber_g=1.8, salt_g=0.0),
    _food("boniato_asado", "Boniato", 90, 2.0, 0.2, 20.7, aliases=("batata", "boniato asado"), fiber_g=3.3, salt_g=0.1),
    _food("huevo_entero", "Huevo", 143, 12.6, 9.5, 0.7, aliases=("huevo entero", "huevo de gallina"), sat_fat_g=3.1, salt_g=0.36, serving_size_g=60),
    _food("huevo_cocido", "Huevo cocido", 155, 12.6, 10.6, 1.1, aliases=("huevo duro",), sat_fat_g=3.3, salt_g=0.31, serving_size_g=60),
    _food("huevo_frito", "Huevo frito", 196, 13.6, 15.0, 0.8, aliases=("fried egg",), sat_fat_g=4.1, salt_g=0.33, serving_size_g=60),
    _food("clara_huevo", "Clara de huevo", 52, 10.9, 0.2, 0.7, aliases=("claras", "clara"), salt_g=0.41),
    _food("yema_huevo", "Yema de huevo", 322, 15.9, 26.5, 3.6, aliases=("yema",), sat_fat_g=9.6, salt_g=0.12),
    _food("tortilla_francesa", "Tortilla francesa", 154, 10.2, 11.8, 1.2, aliases=("tortilla de huevo", "omelette"), sat_fat_g=3.3, salt_g=0.5),
    _food("aceite_oliva_virgen_extra", "Aceite de oliva virgen extra", 884, 0.0, 100.0, 0.0, aliases=("aceite oliva", "aove"), sat_fat_g=14.0),
    _food("aceite_girasol", "Aceite de girasol", 884, 0.0, 100.0, 0.0, aliases=("aceite vegetal",), sat_fat_g=10.3),
    _food("mantequilla", "Mantequilla", 717, 0.9, 81.1, 0.1, aliases=("butter",), sat_fat_g=51.4, salt_g=0.8),
    _food("margarina", "Margarina", 717, 0.2, 80.0, 0.7, aliases=("margarina vegetal",), sat_fat_g=16.0, salt_g=0.7),
    _food("mayonesa", "Mayonesa", 680, 1.0, 75.0, 1.0, aliases=("mahonesa",), sat_fat_g=11.0, salt_g=1.5),
    _food("pechuga_pollo", "Pechuga de pollo", 120, 22.5, 2.6, 0.0, aliases=("pollo", "pollo pechuga", "pollo a la plancha"), sat_fat_g=0.7, salt_g=0.15),
    _food("muslo_pollo", "Muslo de pollo", 177, 24.0, 8.0, 0.0, aliases=("pollo muslo",), sat_fat_g=2.2, salt_g=0.18),
    _food("pavo_pechuga", "Pechuga de pavo", 104, 24.0, 1.2, 0.0, aliases=("pavo", "fiambre de pavo"), sat_fat_g=0.3, salt_g=0.12),
    _food("ternera_magra", "Ternera magra", 145, 21.0, 6.0, 0.0, aliases=("ternera", "filete de ternera"), sat_fat_g=2.4, salt_g=0.15),
    _food("carne_picada_ternera", "Carne picada de ternera", 176, 20.0, 10.0, 0.0, aliases=("carne picada", "carne de ternera"), sat_fat_g=4.0, salt_g=0.16),
    _food("cerdo_lomo", "Lomo de cerdo", 143, 21.0, 6.0, 0.0, aliases=("cerdo", "lomo cerdo"), sat_fat_g=2.1, salt_g=0.14),
    _food("jamon_cocido", "Jamon cocido", 116, 18.0, 4.0, 1.5, aliases=("jamon york",), sat_fat_g=1.4, salt_g=2.0),
    _food("jamon_serrano", "Jamon serrano", 241, 31.0, 13.0, 0.0, aliases=("serrano",), sat_fat_g=4.2, salt_g=4.4),
    _food("hamburguesa_vacuno", "Hamburguesa de vacuno", 250, 17.0, 20.0, 1.0, aliases=("hamburguesa", "burger vacuno"), sat_fat_g=8.0, salt_g=1.0),
    _food("hamburguesa_pollo", "Hamburguesa de pollo", 195, 18.0, 12.0, 3.0, aliases=("burger pollo",), sat_fat_g=3.5, salt_g=1.0),
    _food("atun_lata_natural", "Atun al natural", 116, 26.0, 1.0, 0.0, aliases=("atun natural", "lata atun natural"), sat_fat_g=0.3, salt_g=1.0),
    _food("atun_lata_aceite", "Atun en aceite", 198, 24.0, 11.0, 0.0, aliases=("atun aceite", "lata atun aceite"), sat_fat_g=2.0, salt_g=1.0),
    _food("salmon", "Salmon", 208, 20.0, 13.0, 0.0, aliases=("filete de salmon",), sat_fat_g=3.1, salt_g=0.15),
    _food("merluza", "Merluza", 86, 18.0, 1.3, 0.0, aliases=("filete de merluza", "pescado blanco"), sat_fat_g=0.3, salt_g=0.2),
    _food("gambas", "Gambas", 99, 24.0, 0.3, 0.2, aliases=("langostinos", "camarones"), salt_g=0.37),
    _food("lentejas_cocidas", "Lentejas cocidas", 116, 9.0, 0.4, 20.0, aliases=("lentejas",), fiber_g=8.0, salt_g=0.01),
    _food("garbanzos_cocidos", "Garbanzos cocidos", 164, 8.9, 2.6, 27.4, aliases=("garbanzos",), fiber_g=7.6, salt_g=0.02),
    _food("alubias_cocidas", "Alubias cocidas", 127, 8.7, 0.5, 22.8, aliases=("judias cocidas", "frijoles"), fiber_g=6.4, salt_g=0.02),
    _food("hummus", "Hummus", 166, 7.9, 9.6, 14.3, aliases=("pure de garbanzo",), fiber_g=6.0, salt_g=0.7),
    _food("leche_entera", "Leche entera", 62, 3.2, 3.3, 4.8, aliases=("leche",), nutrition_basis=NutritionBasis.per_100ml, sat_fat_g=2.1, sugars_g=4.8, salt_g=0.1),
    _food("leche_semidesnatada", "Leche semidesnatada", 47, 3.3, 1.6, 4.8, aliases=("leche semi",), nutrition_basis=NutritionBasis.per_100ml, sat_fat_g=1.0, sugars_g=4.8, salt_g=0.1),
    _food("leche_desnatada", "Leche desnatada", 35, 3.4, 0.2, 5.0, aliases=("leche desnatada", "leche sin grasa"), nutrition_basis=NutritionBasis.per_100ml, sat_fat_g=0.1, sugars_g=5.0, salt_g=0.1),
    _food("bebida_soja", "Bebida de soja", 33, 3.3, 1.8, 0.7, aliases=("leche soja",), nutrition_basis=NutritionBasis.per_100ml, sat_fat_g=0.3, sugars_g=0.2, salt_g=0.09),
    _food("bebida_avena", "Bebida de avena", 46, 1.0, 1.5, 6.7, aliases=("leche avena",), nutrition_basis=NutritionBasis.per_100ml, sat_fat_g=0.2, sugars_g=3.5, salt_g=0.1),
    _food("yogur_natural", "Yogur natural", 63, 3.5, 3.3, 4.7, aliases=("yogur", "yoghurt natural"), sat_fat_g=2.1, sugars_g=4.7, salt_g=0.1),
    _food("yogur_griego", "Yogur griego", 133, 6.0, 10.0, 3.8, aliases=("yogur griego",), sat_fat_g=6.6, sugars_g=3.8, salt_g=0.1),
    _food("queso_fresco_batido", "Queso fresco batido", 70, 8.0, 0.2, 5.0, aliases=("queso batido", "qfb"), sugars_g=4.5, salt_g=0.1),
    _food("queso_burgos", "Queso fresco", 174, 11.0, 13.0, 3.0, aliases=("queso burgos",), sat_fat_g=8.5, salt_g=0.7),
    _food("manzana", "Manzana", 52, 0.3, 0.2, 13.8, aliases=("manzana roja", "manzana verde", "apple"), sugars_g=10.4, fiber_g=2.4),
    _food("platano", "Platano", 89, 1.1, 0.3, 22.8, aliases=("banana", "platano canario"), sugars_g=12.2, fiber_g=2.6),
    _food("pera", "Pera", 57, 0.4, 0.1, 15.0, aliases=("pera conferencia",), sugars_g=9.8, fiber_g=3.1),
    _food("naranja", "Naranja", 47, 0.9, 0.1, 11.8, aliases=("orange",), sugars_g=9.4, fiber_g=2.4),
    _food("mandarina", "Mandarina", 53, 0.8, 0.3, 13.3, aliases=("clementina",), sugars_g=10.6, fiber_g=1.8),
    _food("fresa", "Fresa", 32, 0.7, 0.3, 7.7, aliases=("fresas",), sugars_g=4.9, fiber_g=2.0),
    _food("arandanos", "Arandanos", 57, 0.7, 0.3, 14.5, aliases=("blueberries",), sugars_g=10.0, fiber_g=2.4),
    _food("uva", "Uva", 69, 0.7, 0.2, 18.1, aliases=("uvas",), sugars_g=15.5, fiber_g=0.9),
    _food("sandia", "Sandia", 30, 0.6, 0.2, 7.6, aliases=("watermelon",), sugars_g=6.2, fiber_g=0.4),
    _food("melon", "Melon", 34, 0.8, 0.2, 8.2, aliases=("melon amarillo",), sugars_g=7.9, fiber_g=0.9),
    _food("pina", "Pina", 50, 0.5, 0.1, 13.1, aliases=("pinya", "ananas"), sugars_g=9.9, fiber_g=1.4),
    _food("mango", "Mango", 60, 0.8, 0.4, 15.0, aliases=("mango maduro",), sugars_g=13.7, fiber_g=1.6),
    _food("kiwi", "Kiwi", 61, 1.1, 0.5, 14.7, aliases=("kiwi verde",), sugars_g=9.0, fiber_g=3.0),
    _food("aguacate", "Aguacate", 160, 2.0, 14.7, 8.5, aliases=("avocado",), sat_fat_g=2.1, sugars_g=0.7, fiber_g=6.7),
    _food("tomate", "Tomate", 18, 0.9, 0.2, 3.9, aliases=("tomate rojo",), sugars_g=2.6, fiber_g=1.2),
    _food("lechuga", "Lechuga", 15, 1.4, 0.2, 2.9, aliases=("ensalada lechuga",), sugars_g=0.8, fiber_g=1.3),
    _food("cebolla", "Cebolla", 40, 1.1, 0.1, 9.3, aliases=("onion",), sugars_g=4.2, fiber_g=1.7),
    _food("ajo", "Ajo", 149, 6.4, 0.5, 33.1, aliases=("garlic",), sugars_g=1.0, fiber_g=2.1),
    _food("zanahoria", "Zanahoria", 41, 0.9, 0.2, 9.6, aliases=("carrot",), sugars_g=4.7, fiber_g=2.8),
    _food("brocoli", "Brocoli", 34, 2.8, 0.4, 6.6, aliases=("brocoli cocido", "brocoli al vapor"), sugars_g=1.7, fiber_g=2.6),
    _food("coliflor", "Coliflor", 25, 1.9, 0.3, 5.0, aliases=("cauliflower",), sugars_g=1.9, fiber_g=2.0),
    _food("pepino", "Pepino", 15, 0.7, 0.1, 3.6, aliases=("cucumber",), sugars_g=1.7, fiber_g=0.5),
    _food("pimiento_rojo", "Pimiento rojo", 31, 1.0, 0.3, 6.0, aliases=("red pepper",), sugars_g=4.2, fiber_g=2.1),
    _food("pimiento_verde", "Pimiento verde", 20, 0.9, 0.2, 4.6, aliases=("green pepper",), sugars_g=2.4, fiber_g=1.7),
    _food("espinacas", "Espinacas", 23, 2.9, 0.4, 3.6, aliases=("spinach",), sugars_g=0.4, fiber_g=2.2),
    _food("calabacin", "Calabacin", 17, 1.2, 0.3, 3.1, aliases=("zucchini",), sugars_g=2.5, fiber_g=1.0),
    _food("berenjena", "Berenjena", 25, 1.0, 0.2, 5.9, aliases=("eggplant",), sugars_g=3.5, fiber_g=3.0),
    _food("champinones", "Champinones", 22, 3.1, 0.3, 3.3, aliases=("setas laminadas", "mushrooms"), sugars_g=2.0, fiber_g=1.0),
    _food("coca_cola", "Coca Cola", 42, 0.0, 0.0, 10.6, aliases=("coca-cola", "cocacola", "cola refresco"), nutrition_basis=NutritionBasis.per_100ml, sugars_g=10.6, salt_g=0.02),
    _food("coca_cola_zero", "Coca Cola Zero", 0, 0.0, 0.0, 0.0, aliases=("coca-cola zero", "cocacola zero", "coke zero"), nutrition_basis=NutritionBasis.per_100ml, sugars_g=0.0, salt_g=0.02),
    _food("pepsi", "Pepsi", 43, 0.0, 0.0, 10.9, aliases=("pepsi cola",), nutrition_basis=NutritionBasis.per_100ml, sugars_g=10.9, salt_g=0.02),
    _food("pepsi_max", "Pepsi Max", 1, 0.0, 0.0, 0.1, aliases=("pepsi zero",), nutrition_basis=NutritionBasis.per_100ml, sugars_g=0.0, salt_g=0.03),
    _food("fanta_naranja", "Fanta naranja", 45, 0.0, 0.0, 11.0, aliases=("fanta",), nutrition_basis=NutritionBasis.per_100ml, sugars_g=11.0, salt_g=0.02),
    _food("aquarius_limon", "Aquarius limon", 19, 0.0, 0.0, 4.6, aliases=("aquarius", "isotonica limon"), nutrition_basis=NutritionBasis.per_100ml, sugars_g=4.6, salt_g=0.12),
    _food("agua", "Agua", 0, 0.0, 0.0, 0.0, aliases=("agua mineral", "water"), nutrition_basis=NutritionBasis.per_100ml),
    _food("cafe_solo", "Cafe solo", 2, 0.1, 0.0, 0.0, aliases=("espresso", "cafe negro"), nutrition_basis=NutritionBasis.per_100ml),
    _food("zumo_naranja", "Zumo de naranja", 45, 0.7, 0.2, 10.4, aliases=("jugo de naranja",), nutrition_basis=NutritionBasis.per_100ml, sugars_g=8.4, salt_g=0.0),
    _food("galleta_maria", "Galletas maria", 444, 7.0, 12.0, 76.0, aliases=("galleta maria", "maria"), sat_fat_g=3.0, sugars_g=23.0, fiber_g=2.8, salt_g=0.7),
    _food("galleta_digestive", "Galleta digestive", 480, 7.0, 20.0, 67.0, aliases=("digestive", "galletas digestive"), sat_fat_g=7.0, sugars_g=20.0, fiber_g=4.5, salt_g=0.8),
    _food("tostada_integral", "Tostadas integrales", 410, 11.0, 7.0, 72.0, aliases=("biscotes integrales",), fiber_g=8.0, salt_g=1.3),
    _food("frutos_secos_mezcla", "Frutos secos naturales", 607, 20.0, 54.0, 21.0, aliases=("mix frutos secos",), sat_fat_g=6.0, sugars_g=4.5, fiber_g=8.5, salt_g=0.02),
    _food("almendras", "Almendras", 579, 21.0, 50.0, 22.0, aliases=("almendra",), sat_fat_g=3.8, sugars_g=4.4, fiber_g=12.5, salt_g=0.01),
    _food("nueces", "Nueces", 654, 15.0, 65.0, 14.0, aliases=("walnuts",), sat_fat_g=6.1, sugars_g=2.6, fiber_g=6.7, salt_g=0.01),
    _food("cacahuetes", "Cacahuetes", 567, 26.0, 49.0, 16.0, aliases=("mani", "peanuts"), sat_fat_g=6.8, sugars_g=4.7, fiber_g=8.5, salt_g=0.01),
    _food("crema_cacahuete", "Crema de cacahuete", 588, 25.0, 50.0, 20.0, aliases=("mantequilla de cacahuete",), sat_fat_g=10.0, sugars_g=9.0, fiber_g=6.0, salt_g=0.5),
)
