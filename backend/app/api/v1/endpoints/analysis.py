from datetime import datetime

from fastapi import APIRouter

from app.schemas.chrono_twin import (
    SCHEMA_DOC,
    SCHEMA_VERSION,
    DailyRecordIn,
)

router = APIRouter()


@router.get("/")
def read_analysis():
    """분석 엔진 상태."""
    return {"status": "Analysis engine is ready.", "schema_version": SCHEMA_VERSION}


@router.get("/schema")
def get_schema():
    """Chrono-Twin 데이터 수집 스키마 문서 (led_lux · led_color_temp 포함, v0.2)."""
    return {
        "version": SCHEMA_VERSION,
        "fields": [f.model_dump() for f in SCHEMA_DOC],
        "new_in_0_2_0": ["led_lux", "led_color_temp"],
        "note": "정책 파트 HCL 제언 + 생명공학 파트 6200K/3000K 멜라토닌 억제 근거로 조명 환경 2필드 추가.",
    }


@router.post("/records/preview")
def preview_record(record: DailyRecordIn):
    """수집 레코드 1건을 검증하고 파생값(수면시간·멜라놉틱 조도·저녁 부하)을 미리 계산."""
    return {
        "valid": True,
        "subject_id": record.subject_id,
        "survey_date": record.survey_date,
        "derived": {
            "sleep_duration_min": record.sleep_duration_min,
            "lighting": {
                "mel_der": record.lighting.mel_der,
                "melanopic_lux": record.lighting.melanopic_lux,
                "evening_load": record.lighting.evening_load,
            },
        },
        "received_at": datetime.utcnow().isoformat() + "Z",
    }
