import re
import unicodedata


def normalize_message_test(text: str) -> str:
    # lowercase
    texto = text.lower()

    # normalize with unicode (NFKD to letters)
    texto = unicodedata.normalize("NFKD", texto)

    # remove "acentos"
    texto = "".join([c for c in texto if not unicodedata.combining(c)])

    # remove special characters (keep letters, numbers and spaces)
    texto = re.sub(r"[^a-z0-9\s]", " ", texto)

    # remove multiple spaces
    texto = re.sub(r"\s+", " ", texto).strip()

    return texto
