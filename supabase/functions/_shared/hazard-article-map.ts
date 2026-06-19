export interface ArticleEntry {
  article: string;
  title: string;
}

export const HAZARD_ARTICLE_MAP: Record<string, ArticleEntry[]> = {
  "추락": [
    { article: "제13조", title: "안전난간의 구조 및 설치요건" },
    { article: "제32조", title: "보호구의 지급 등" },
    { article: "제42조", title: "추락의 방지" },
    { article: "제43조", title: "개구부 등의 방호 조치" },
    { article: "제44조", title: "안전대의 부착설비 등" },
    { article: "제45조", title: "지붕 위에서의 위험 방지" },
    { article: "제56조", title: "작업발판의 구조" },
    { article: "제57조", title: "비계 등의 조립·해체 및 변경" },
  ],
  "감전": [
    { article: "제301조", title: "전기기계·기구 등의 충전부 방호" },
    { article: "제302조", title: "전기기계·기구의 접지" },
    { article: "제304조", title: "누전차단기에 의한 감전방지" },
    { article: "제316조", title: "승압기 등의 위험 방지" },
    { article: "제319조", title: "정전전로에서의 전기작업" },
    { article: "제321조", title: "충전전로에서의 전기작업" },
  ],
  "끼임/말림": [
    { article: "제87조", title: "원동기·회전축 등의 위험 방지" },
    { article: "제88조", title: "기계의 동력차단장치" },
    { article: "제92조", title: "정비 등의 작업 시의 운전정지 등" },
    { article: "제93조", title: "방호장치의 해체 금지" },
    { article: "제192조", title: "탑승의 제한" },
  ],
  "폭발/화재": [
    { article: "제225조", title: "위험물질 등의 제조 등 작업 시의 조치" },
    { article: "제230조", title: "폭발위험이 있는 장소의 설정 및 관리" },
    { article: "제232조", title: "폭발 또는 화재 등의 예방" },
    { article: "제236조", title: "화재 위험이 있는 작업의 일반기준" },
    { article: "제239조", title: "위험물 등이 있는 장소에서 화기 등의 사용 금지" },
    { article: "제240조", title: "유류 등이 있는 배관이나 용기의 용접 등" },
    { article: "제241조", title: "통풍 등이 충분하지 않은 장소에서의 용접 등" },
    { article: "제243조", title: "소화설비" },
  ],
  "질식": [
    { article: "제618조", title: "정의" }, // 밀폐공간 정의 내용 적용될 수 있음
    { article: "제619조", title: "밀폐공간 작업 프로그램의 수립·시행" },
    { article: "제620조", title: "환기 등" },
    { article: "제621조", title: "인원 점검" },
    { article: "제622조", title: "출입의 금지" },
    { article: "제623조", title: "감시인의 배치 등" },
  ],
  "붕괴": [
    { article: "제50조", title: "붕괴 등 등에 의한 위험 방지" },
    { article: "제51조", title: "구축물 또는 이와 유사한 시설물 등의 안전 유지" },
    { article: "제328조", title: "재료의 결함 유무 등 점검" },
    { article: "제332조", title: "거푸집동바리등의 구조점검 등" },
    { article: "제339조", title: "토석붕괴 위험 방지" },
    { article: "제340조", title: "지반의 붕괴 등에 의한 위험의 방지" },
  ],
  "절단/베임": [
    { article: "제100조", title: "띠톱기계의 덮개 등" },
    { article: "제101조", title: "원형톱기계의 톱날접촉예방장치" },
    { article: "제104조", title: "동력식 수동대패기계의 칼날접촉예방장치" },
    { article: "제105조", title: "모떼기기계의 날접촉예방장치" },
    { article: "제109조", title: "프레스등의 위험 방지" },
    { article: "제110조", title: "절단기들의 조작구역" }, // 제목은 PDF에 기재된 그대로에 가깝게
  ],
  "낙하물/비래": [
    { article: "제14조", title: "낙하물에 의한 위험의 방지" },
    { article: "제15조", title: "투하설비 등" },
    { article: "제193조", title: "비래물에 의한 위험 방지" },
    { article: "제198조", title: "화물의 낙하·비래 위험의 방지" },
  ],
  "차량/이동장비 충돌": [
    { article: "제39조", title: "작업지휘자의 지정" },
    { article: "제40조", title: "신호" },
    { article: "제171조", title: "전도 등의 방지" },
    { article: "제172조", title: "접촉의 방지" },
    { article: "제179조", title: "전조등 등의 설치" },
    { article: "제184조", title: "제동장치 등" },
    { article: "제197조", title: "전조등의 설치" },
    { article: "제199조", title: "전도 등의 방지" },
    { article: "제200조", title: "접촉 방지" },
  ],
  "화학노출": [
    { article: "제420조", title: "정의" }, // 관리대상 유해물질 등 정의
    { article: "제422조", title: "관리대상 유해물질과 관련된 설비의 제어장치 등" },
    { article: "제437조", title: "마스크의 사용 등" },
    { article: "제440조", title: "세척시설 등" },
  ],
  "소음/분진/반복작업": [
    { article: "제512조", title: "정의" },
    { article: "제513조", title: "소음감소 조치" },
    { article: "제514조", title: "진동보호 조치" },
    { article: "제515조", title: "조작스위치 등의 진동 방지" },
    { article: "제516조", title: "청력보호구의 지급 등" },
  ]
};
