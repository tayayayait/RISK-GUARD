# RISK-GUARD XML 예시

아래 XML은 [상세서.md](/C:/Users/dbcdk/Desktop/RISK%20GUARD/상세서.md)를 누락 없이 계층 구조로 재정리한 구현 예시다.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<riskGuardSpecification id="RISK-GUARD" version="1.0" generatedDate="2026-04-09" locale="ko-KR" sourceDocument="상세서.md">
  <metadata>
    <title>RISK-GUARD 상세서 XML 예시</title>
    <documentPurpose>RISK-GUARD 웹 대시보드의 구현 기준 문서를 XML 계층 구조로 표현한 예시</documentPurpose>
    <targetAudiences>
      <audience>기획자</audience>
      <audience>디자이너</audience>
      <audience>프론트엔드 개발자</audience>
      <audience>백엔드 개발자</audience>
    </targetAudiences>
  </metadata>

  <documentScope>
    <includedScopes>
      <scope id="included-01">작업 입력, AI 분석, 근거 탐색, 교육자료 추천, 위험성평가서 출력까지의 전체 사용자 흐름</scope>
      <scope id="included-02">KOSHA OpenAPI 4종과 Gemini 기반 구조화 결과를 소비하는 UI/UX 규칙</scope>
      <scope id="included-03">데스크톱 웹 대시보드 기준 정보 구조, 화면 배치, 상호작용 규칙</scope>
      <scope id="included-04">공통 디자인 시스템과 컴포넌트 설계 기준</scope>
    </includedScopes>
    <excludedScopes>
      <scope id="excluded-01">모바일 앱</scope>
      <scope id="excluded-02">관리자용 통계 화면</scope>
      <scope id="excluded-03">다크 모드</scope>
      <scope id="excluded-04">다국어 UI 번역</scope>
      <scope id="excluded-05">사용자 권한 체계 세분화</scope>
    </excludedScopes>
  </documentScope>

  <environment>
    <supportedDevices>
      <device>데스크톱</device>
      <device>노트북</device>
    </supportedDevices>
    <minimumResolution widthPx="1024" heightPx="768"/>
    <recommendedResolution widthPx="1440" heightPx="900"/>
    <supportedBrowsers>
      <browser name="Chrome" supportRange="latest-2"/>
      <browser name="Edge" supportRange="latest-2"/>
    </supportedBrowsers>
    <layoutDirection>가로형 레이아웃 고정</layoutDirection>
    <theme>라이트 테마 단일 운영</theme>
  </environment>

  <serviceStructure>
    <navigation mode="step-based" shellType="single-dashboard-shell" totalScreens="6"/>

    <screenRoutes>
      <screen id="SCR-01" route="/assessments/new" name="작업 입력">
        <purpose>작업명, 설명, 사진 입력</purpose>
        <nextCondition>필수값 유효성 통과 후 AI 분석 시작</nextCondition>
      </screen>
      <screen id="SCR-02" route="/assessments/:id/profile-review" name="AI 분석 확인">
        <purpose>Gemini 추론 결과 검토 및 수정</purpose>
        <nextCondition>필수 프로필 확정</nextCondition>
      </screen>
      <screen id="SCR-03" route="/assessments/:id/analysis" name="분석 결과">
        <purpose>위험등급, 즉시 조치, 사고 시나리오 확인</purpose>
        <nextCondition>위험 분석 데이터 생성 완료</nextCondition>
      </screen>
      <screen id="SCR-04" route="/assessments/:id/evidence" name="근거 화면">
        <purpose>유사 재해사례, 사고사망 사례, 법령·Guide 확인</purpose>
        <nextCondition>근거 선택 또는 검토 완료</nextCondition>
      </screen>
      <screen id="SCR-05" route="/assessments/:id/materials" name="교육 화면">
        <purpose>안전보건자료 추천 및 선택</purpose>
        <nextCondition>자료 검토 완료</nextCondition>
      </screen>
      <screen id="SCR-06" route="/assessments/:id/report" name="문서 출력">
        <purpose>위험성평가서 초안, 체크리스트, 브리핑 문안 편집 및 저장</purpose>
        <nextCondition>내보내기 성공 또는 복사 완료</nextCondition>
      </screen>
    </screenRoutes>

    <dataSources>
      <dataSource id="gemini-analysis" type="ai">
        <name>Gemini 텍스트/이미지 분석</name>
        <usedScreens>
          <screenRef>SCR-02</screenRef>
          <screenRef>SCR-03</screenRef>
          <screenRef>SCR-06</screenRef>
        </usedScreens>
        <inputs>
          <input>작업명</input>
          <input>설명</input>
          <input>사진</input>
        </inputs>
        <outputs>
          <output>업종</output>
          <output>작업장소</output>
          <output>장비</output>
          <output>위험요인</output>
          <output>즉시 조치</output>
          <output>브리핑 문안</output>
        </outputs>
        <uiPresentation>구조화 카드, 태그, 경고문, 문서 초안</uiPresentation>
      </dataSource>

      <dataSource id="kosha-domestic-case" type="public-api">
        <name>KOSHA 국내재해사례 API</name>
        <usedScreens>
          <screenRef>SCR-04</screenRef>
          <screenRef>SCR-06</screenRef>
        </usedScreens>
        <inputs>
          <input>업종</input>
          <input>키워드</input>
          <input>페이지</input>
        </inputs>
        <outputs>
          <output>유사 재해사례 목록</output>
        </outputs>
        <uiPresentation>사례 카드, 요약 불릿, 인용 근거</uiPresentation>
      </dataSource>

      <dataSource id="kosha-fatality" type="public-api">
        <name>KOSHA 사고사망 API</name>
        <usedScreens>
          <screenRef>SCR-03</screenRef>
          <screenRef>SCR-04</screenRef>
          <screenRef>SCR-06</screenRef>
        </usedScreens>
        <inputs>
          <input>위험유형</input>
          <input>작업장소</input>
          <input>키워드</input>
        </inputs>
        <outputs>
          <output>사망사고 일자</output>
          <output>장소</output>
          <output>개요</output>
          <output>피해 규모</output>
        </outputs>
        <uiPresentation>중대위험 경고 카드, 사례 카드</uiPresentation>
      </dataSource>

      <dataSource id="kosha-law-search" type="public-api">
        <name>KOSHA 법령 스마트검색 API</name>
        <usedScreens>
          <screenRef>SCR-04</screenRef>
          <screenRef>SCR-06</screenRef>
        </usedScreens>
        <inputs>
          <input>위험키워드</input>
          <input>작업명</input>
        </inputs>
        <outputs>
          <output>법령</output>
          <output>고시</output>
          <output>Guide</output>
          <output>미디어 자료</output>
        </outputs>
        <uiPresentation>근거 카드, 적용 포인트 리스트</uiPresentation>
      </dataSource>

      <dataSource id="kosha-material-link" type="public-api">
        <name>KOSHA 안전보건자료 링크 API</name>
        <usedScreens>
          <screenRef>SCR-05</screenRef>
          <screenRef>SCR-06</screenRef>
        </usedScreens>
        <inputs>
          <input>업종</input>
          <input>재해유형</input>
          <input>자료형태</input>
          <input>외국어 구분</input>
        </inputs>
        <outputs>
          <output>자료 URL</output>
          <output>제목</output>
          <output>분류</output>
        </outputs>
        <uiPresentation>추천 카드, 링크 버튼, 브리핑 첨부</uiPresentation>
      </dataSource>
    </dataSources>

    <resultCollectionRules>
      <collection id="domestic-case" maxItems="20" initialItems="5" loadMoreStep="5" sortPrimary="관련도" sortSecondary="최신순"/>
      <collection id="fatality-case" maxItems="10" initialItems="3" loadMoreStep="3" sortPrimary="관련도" sortSecondary="최신순"/>
      <collection id="law-guide" maxItems="12" initialItems="6" loadMoreStep="3" sortPrimary="관련도" sortSecondary="관련도 우선"/>
      <collection id="materials" maxItems="12" initialItems="8" loadMoreStep="4" sortPrimary="관련도" sortSecondary="자료형 우선순위"/>
      <collection id="report-citations" maxItems="12" initialItems="all" loadMoreStep="0" sortPrimary="사용자 선택 순서"/>
    </resultCollectionRules>

    <queryGenerationRules>
      <rule id="query-01" target="국내재해사례">
        <description>업종 1개 + 핵심 위험요인 2개 + 장비명 1개 조합으로 최대 4개 질의 생성</description>
        <maxQueries>4</maxQueries>
      </rule>
      <rule id="query-02" target="사고사망">
        <description>위험요인 1순위 + 작업장소 + 장비명 조합으로 2개 질의 생성</description>
        <maxQueries>2</maxQueries>
      </rule>
      <rule id="query-03" target="법령검색">
        <description>작업명 + 위험요인 + 조치 키워드 조합으로 3개 질의 생성</description>
        <maxQueries>3</maxQueries>
      </rule>
      <rule id="query-04" target="교육자료">
        <description>업종 + 재해유형 + 자료형태 + 외국어 여부 사용</description>
      </rule>
      <deduplication>
        <strategy>제목 + 발행일 또는 제목 + URL 기준 중복 제거</strategy>
      </deduplication>
    </queryGenerationRules>
  </serviceStructure>

  <layoutSystem>
    <dashboardShell appliesToScreens="SCR-02,SCR-03,SCR-04,SCR-05,SCR-06">
      <region id="top-header" heightPx="64">
        <contents>
          <item>로고</item>
          <item>현재 단계명</item>
          <item>저장 상태</item>
          <item>우측 전역 액션</item>
        </contents>
      </region>
      <region id="left-step-rail" widthPx="240">
        <behavior>6단계 스테퍼 고정, 현재 단계 강조</behavior>
      </region>
      <region id="main-content" widthMode="flex-1">
        <behavior>최대 폭 제한 없음, 내부 12컬럼 그리드 사용</behavior>
      </region>
      <region id="right-utility-rail" widthPx="320">
        <contents>
          <item>요약 정보</item>
          <item>선택 근거</item>
          <item>저장 상태</item>
        </contents>
      </region>
      <pagePadding horizontalPx="24" verticalPx="24" horizontalPxAt1600Plus="32"/>
      <cardSpacing defaultPx="16" sectionGapPx="24"/>
    </dashboardShell>

    <gridRules>
      <grid minWidthPx="1600" columns="12" columnGapPx="24" outerMarginPx="32"/>
      <grid minWidthPx="1280" maxWidthPx="1599" columns="12" columnGapPx="24" outerMarginPx="24"/>
      <grid minWidthPx="1024" maxWidthPx="1279" columns="8" columnGapPx="20" outerMarginPx="20"/>
    </gridRules>

    <spacingTokens>
      <token name="space-1" value="4px"/>
      <token name="space-2" value="8px"/>
      <token name="space-3" value="12px"/>
      <token name="space-4" value="16px"/>
      <token name="space-5" value="20px"/>
      <token name="space-6" value="24px"/>
      <token name="space-8" value="32px"/>
      <token name="space-10" value="40px"/>
      <token name="space-12" value="48px"/>
      <token name="space-16" value="64px"/>
    </spacingTokens>

    <shapeAndShadowTokens>
      <radiusTokens>
        <token name="radius-sm" value="8px" usage="배지, 태그"/>
        <token name="radius-md" value="12px" usage="버튼, 입력창"/>
        <token name="radius-lg" value="16px" usage="카드, 드롭다운"/>
        <token name="radius-xl" value="20px" usage="모달, 대형 요약 카드"/>
      </radiusTokens>
      <shadowTokens>
        <token name="shadow-sm" value="0 1px 2px rgba(16, 24, 40, 0.06)" usage="드롭다운"/>
        <token name="shadow-md" value="0 8px 24px rgba(16, 24, 40, 0.08)" usage="모달"/>
        <token name="card-default" value="none" usage="카드 기본 상태는 그림자 없음"/>
      </shadowTokens>
    </shapeAndShadowTokens>
  </layoutSystem>

  <designSystem>
    <colorPalette>
      <brandAndNeutralColors>
        <color token="color-primary-900" value="#0E2238" usage="헤더 텍스트, 고정 강조"/>
        <color token="color-primary-700" value="#164872" usage="기본 CTA, 현재 단계 표시"/>
        <color token="color-primary-600" value="#1E5F94" usage="hover, 링크"/>
        <color token="color-primary-050" value="#EFF6FB" usage="선택 배경"/>
        <color token="color-accent-600" value="#E66A00" usage="주의 강조, 주요 경고 포인트"/>
        <color token="color-accent-050" value="#FFF4E8" usage="경고 배경"/>
        <color token="color-neutral-900" value="#13202E" usage="본문 기본 텍스트"/>
        <color token="color-neutral-700" value="#334155" usage="보조 텍스트"/>
        <color token="color-neutral-500" value="#64748B" usage="플레이스홀더, 서브 메타"/>
        <color token="color-neutral-300" value="#CBD5E1" usage="기본 테두리"/>
        <color token="color-neutral-200" value="#DCE5EE" usage="구분선"/>
        <color token="color-neutral-100" value="#EAF0F5" usage="보조 배경"/>
        <color token="color-neutral-050" value="#F7FAFC" usage="앱 배경"/>
        <color token="color-surface" value="#FFFFFF" usage="카드 배경"/>
      </brandAndNeutralColors>

      <semanticColors>
        <color token="color-danger-600" value="#B42318" usage="치명 위험, 오류"/>
        <color token="color-danger-050" value="#FEF3F2" usage="치명 위험 배경"/>
        <color token="color-warning-600" value="#B54708" usage="고위험, 주의"/>
        <color token="color-warning-050" value="#FFFAEB" usage="주의 배경"/>
        <color token="color-success-600" value="#027A48" usage="정상, 완료"/>
        <color token="color-success-050" value="#ECFDF3" usage="성공 배경"/>
        <color token="color-info-600" value="#0B63CE" usage="정보성 안내"/>
        <color token="color-info-050" value="#EFF8FF" usage="정보 배경"/>
      </semanticColors>

      <riskLevelColors>
        <riskLevel id="critical" textColor="#B42318" backgroundColor="#FEF3F2" borderColor="#F7B4AE" usageCondition="즉시 작업중지 검토 필요"/>
        <riskLevel id="high" textColor="#C4320A" backgroundColor="#FFF4ED" borderColor="#F9B27C" usageCondition="우선 개선조치 필요"/>
        <riskLevel id="medium" textColor="#B54708" backgroundColor="#FFFAEB" borderColor="#F3D69F" usageCondition="작업 전 확인 필요"/>
        <riskLevel id="low" textColor="#027A48" backgroundColor="#ECFDF3" borderColor="#8FE3B8" usageCondition="기본 관리 유지"/>
      </riskLevelColors>

      <colorUsageRules>
        <rule id="color-rule-01">본문 배경은 항상 color-neutral-050 사용</rule>
        <rule id="color-rule-02">카드 배경은 항상 color-surface 사용</rule>
        <rule id="color-rule-03">테두리는 기본적으로 1px solid color-neutral-200 사용</rule>
        <rule id="color-rule-04">경고 정보는 색상만으로 구분하지 않고 아이콘과 텍스트 라벨을 반드시 함께 사용</rule>
        <rule id="color-rule-05">color-accent-600은 CTA 배경으로 사용하지 않으며 CTA는 color-primary-700 고정</rule>
      </colorUsageRules>
    </colorPalette>

    <typography>
      <fontFamilies>
        <font role="base-ui">
          <family>Pretendard Variable</family>
          <family>Noto Sans KR</family>
          <family>sans-serif</family>
        </font>
        <font role="numeric-and-code">
          <family>JetBrains Mono</family>
          <family>D2Coding</family>
          <family>monospace</family>
        </font>
      </fontFamilies>

      <typeScale>
        <type token="display-lg" fontSizePx="32" lineHeightPx="40" fontWeight="700" usage="보고서 상단 제목"/>
        <type token="heading-1" fontSizePx="28" lineHeightPx="36" fontWeight="700" usage="화면 제목"/>
        <type token="heading-2" fontSizePx="22" lineHeightPx="30" fontWeight="700" usage="카드 섹션 제목"/>
        <type token="heading-3" fontSizePx="18" lineHeightPx="26" fontWeight="600" usage="서브 섹션 제목"/>
        <type token="body-lg" fontSizePx="16" lineHeightPx="24" fontWeight="500" usage="요약 본문"/>
        <type token="body-md" fontSizePx="14" lineHeightPx="22" fontWeight="400" usage="일반 본문 기본"/>
        <type token="body-sm" fontSizePx="13" lineHeightPx="20" fontWeight="500" usage="보조 설명"/>
        <type token="label-md" fontSizePx="13" lineHeightPx="18" fontWeight="600" usage="입력 라벨, 탭"/>
        <type token="caption" fontSizePx="12" lineHeightPx="18" fontWeight="500" usage="상태 설명, 메타"/>
        <type token="metric-lg" fontSizePx="24" lineHeightPx="28" fontWeight="700" usage="위험점수, 건수"/>
      </typeScale>

      <typographyRules>
        <rule id="type-rule-01">한 화면 내 제목 단계는 최대 3단계까지만 사용</rule>
        <rule id="type-rule-02">데이터 수치와 점수는 숫자 폰트와 tabular-nums 사용</rule>
        <rule id="type-rule-03">경고문은 한 문단 최대 3줄 이내</rule>
        <rule id="type-rule-04">본문 기본 크기는 14px 미만 금지</rule>
      </typographyRules>
    </typography>
  </designSystem>

  <componentSystem>
    <buttons>
      <sizes>
        <size id="lg" heightPx="48" paddingXpx="20" iconSizePx="18" radiusPx="12"/>
        <size id="md" heightPx="40" paddingXpx="16" iconSizePx="16" radiusPx="12"/>
        <size id="sm" heightPx="32" paddingXpx="12" iconSizePx="16" radiusPx="8"/>
      </sizes>
      <variants>
        <variant id="primary" background="color-primary-700" textColor="#FFFFFF" border="none" usage="단계 진행, 저장, 분석 시작"/>
        <variant id="secondary" background="#FFFFFF" textColor="color-neutral-900" border="color-neutral-300" usage="보조 액션"/>
        <variant id="ghost" background="transparent" textColor="color-neutral-700" border="none" usage="카드 내부 보조 액션"/>
        <variant id="danger" background="color-danger-600" textColor="#FFFFFF" border="none" usage="삭제, 제외"/>
      </variants>
      <stateRules>
        <rule id="button-state-01">hover 시 배경을 한 단계 진하게 변경</rule>
        <rule id="button-state-02">disabled 시 배경 color-neutral-100, 텍스트 color-neutral-500, cursor not-allowed</rule>
        <rule id="button-state-03">loading 시 텍스트 유지, 좌측 16px 스피너 추가</rule>
      </stateRules>
    </buttons>

    <cards>
      <cardType id="section-card" paddingPx="20" minimumHeightPx="0" usage="일반 정보 블록"/>
      <cardType id="metric-card" paddingPx="20" minimumHeightPx="132" usage="점수, 건수"/>
      <cardType id="evidence-card" paddingPx="20" minimumHeightPx="168" usage="사례, 법령, 자료 카드"/>
      <cardType id="alert-card" paddingPx="20" minimumHeightPx="140" usage="즉시 조치, 치명 경고"/>
      <cardType id="report-card" paddingPx="24" minimumHeightPx="0" usage="문서 편집"/>
      <rules>
        <rule id="card-rule-01">기본 카드 테두리는 1px solid color-neutral-200</rule>
        <rule id="card-rule-02">alert-card는 좌측 4px 강조바 사용</rule>
        <rule id="card-rule-03">카드 내부 제목과 본문 간격 8px</rule>
        <rule id="card-rule-04">본문과 액션 간격 16px</rule>
      </rules>
    </cards>

    <inputs>
      <inputType id="text-input" heightPx="44" rules="라벨 상단 배치, placeholder 최대 30자"/>
      <inputType id="textarea" minHeightPx="132" maxHeightPx="280" rules="자동 세로 확장 허용"/>
      <inputType id="select" heightPx="44" rules="단일 선택, 검색형 허용"/>
      <inputType id="multi-tag-input" minHeightPx="44" tagLimit="8" maxCharactersPerTag="16" rules="태그 입력형"/>
      <inputType id="checkbox" sizePx="20" rules="라벨 클릭 영역 전체 활성화"/>
      <inputType id="toggle" widthPx="40" heightPx="24" rules="이진 상태에만 사용"/>

      <inputStates>
        <state id="default" borderColor="color-neutral-300" backgroundColor="#FFFFFF" extra="없음"/>
        <state id="focus" borderColor="color-primary-600" backgroundColor="#FFFFFF" extra="외곽 4px focus ring"/>
        <state id="error" borderColor="color-danger-600" backgroundColor="#FFFFFF" extra="하단 오류문구"/>
        <state id="disabled" borderColor="color-neutral-200" backgroundColor="color-neutral-100" extra="텍스트 color-neutral-500"/>
      </inputStates>
    </inputs>

    <fileUpload>
      <dropzone heightPx="180" borderStyle="1.5px dashed color-neutral-300"/>
      <allowedFormats>
        <format>jpg</format>
        <format>jpeg</format>
        <format>png</format>
        <format>webp</format>
      </allowedFormats>
      <fileLimit maxFiles="5" maxFileSizeMb="10" recommendedMinWidthPx="1280" recommendedMinHeightPx="720"/>
      <rules>
        <rule id="upload-rule-01">업로드 직후 96x96px 썸네일 표시</rule>
        <rule id="upload-rule-02">업로드 중인 파일은 썸네일 위 progress bar 표시</rule>
        <rule id="upload-rule-03">실패 파일은 썸네일을 남기지 않고 오류 토스트 표시</rule>
      </rules>
    </fileUpload>

    <navigationAndIndicators>
      <component id="tab" heightPx="40" rules="활성 탭 하단 2px 실선, 좌우 패딩 12px"/>
      <component id="accordion" headerHeightPx="56" rules="보고서 편집 섹션에만 사용"/>
      <component id="badge" heightPx="24" rules="상태, 출처, 위험등급 표시"/>
      <component id="tag-chip" heightPx="28" rules="장비, 위험요인, 검색어 편집용"/>
    </navigationAndIndicators>

    <overlaysAndFeedback>
      <overlay id="confirm-modal" widthPx="480" usage="삭제, 이동 이탈 확인"/>
      <overlay id="detail-modal" widthPx="720" usage="사례 원문, 법령 원문 보기"/>
      <overlay id="full-width-modal" widthPx="960" usage="보고서 미리보기 확장"/>
      <overlay id="right-drawer" widthPx="360" usage="1024px~1279px에서 유틸리티 레일 대체"/>
      <overlay id="toast" widthPx="360" usage="우측 상단, 최대 2개 누적"/>
      <toastRules>
        <rule id="toast-rule-01">성공 토스트는 4초 후 자동 닫힘</rule>
        <rule id="toast-rule-02">오류 토스트는 자동 닫힘 없음</rule>
        <rule id="toast-rule-03">동일 오류 메시지는 1회만 표시</rule>
      </toastRules>
    </overlaysAndFeedback>
  </componentSystem>

  <stateDefinitions>
    <enums>
      <enum name="AssessmentStep">
        <value>input</value>
        <value>profile_review</value>
        <value>analysis</value>
        <value>evidence</value>
        <value>materials</value>
        <value>report</value>
      </enum>
      <enum name="AssessmentStatus">
        <value>draft</value>
        <value>analyzing</value>
        <value>review_required</value>
        <value>analysis_ready</value>
        <value>evidence_loading</value>
        <value>ready_for_report</value>
        <value>exporting</value>
        <value>completed</value>
        <value>error</value>
      </enum>
      <enum name="ApiStatus">
        <value>idle</value>
        <value>loading</value>
        <value>success</value>
        <value>empty</value>
        <value>error</value>
        <value>partial</value>
      </enum>
      <enum name="RiskLevel">
        <value>critical</value>
        <value>high</value>
        <value>medium</value>
        <value>low</value>
      </enum>
      <enum name="ConfidenceLevel">
        <value>high</value>
        <value>medium</value>
        <value>low</value>
      </enum>
      <enum name="ExportFormat">
        <value>pdf</value>
        <value>docx</value>
        <value>clipboard</value>
      </enum>
    </enums>

    <displayStatuses>
      <status id="draft" label="입력 중">최초 생성 후 저장만 된 상태</status>
      <status id="analyzing" label="AI 분석 중">Gemini 응답 대기</status>
      <status id="review_required" label="사용자 확인 필요">낮은 신뢰도 항목 존재 또는 미확정 필수값 존재</status>
      <status id="analysis_ready" label="분석 완료">위험등급과 즉시 조치 계산 완료</status>
      <status id="evidence_loading" label="근거 조회 중">KOSHA API 결과 수집 중</status>
      <status id="ready_for_report" label="보고서 생성 가능">최소 필수 데이터 충족</status>
      <status id="exporting" label="파일 생성 중">PDF/DOCX 생성 중</status>
      <status id="completed" label="저장 완료">내보내기 완료</status>
      <status id="error" label="처리 실패">재시도 가능 상태</status>
    </displayStatuses>

    <confidenceRanges>
      <range id="high" minInclusive="0.85" maxInclusive="1.00" uiTreatment="기본 표시"/>
      <range id="medium" minInclusive="0.65" maxInclusive="0.84" uiTreatment="정보 배지 표시"/>
      <range id="low" minInclusive="0.00" maxInclusive="0.64" uiTreatment="빨간 점선 테두리와 확인 배너 표시"/>
    </confidenceRanges>

    <riskScoring>
      <scoreRange min="0" max="100" integerOnly="true"/>
      <calculationSteps>
        <step order="1">확인된 위험요인 최대 3개 선택</step>
        <step order="2">각 위험요인 가중치 합산</step>
        <step order="3">고위험 장비 보정치 추가</step>
        <step order="4">사고사망 사례 유사도 보정치 추가</step>
        <step order="5">최종값은 100 초과 금지</step>
      </calculationSteps>

      <hazardWeights>
        <hazard type="추락" score="30"/>
        <hazard type="붕괴" score="35"/>
        <hazard type="질식" score="35"/>
        <hazard type="폭발/화재" score="35"/>
        <hazard type="감전" score="35"/>
        <hazard type="끼임/협착" score="25"/>
        <hazard type="절단" score="25"/>
        <hazard type="낙하물/비래" score="20"/>
        <hazard type="차량/이동장비 충돌" score="25"/>
        <hazard type="화학노출" score="25"/>
        <hazard type="소음/분진/반복작업" score="10"/>
      </hazardWeights>

      <highRiskEquipmentAdjustment scoreDelta="15">
        <equipment>지게차</equipment>
        <equipment>크레인</equipment>
        <equipment>고소작업대</equipment>
        <equipment>절단기</equipment>
        <equipment>배전반</equipment>
        <equipment>밀폐공간 장비</equipment>
      </highRiskEquipmentAdjustment>

      <fatalitySimilarityAdjustments>
        <adjustment minSimilarity="0.80" maxSimilarity="1.00" scoreDelta="20"/>
        <adjustment minSimilarity="0.60" maxSimilarity="0.79" scoreDelta="10"/>
      </fatalitySimilarityAdjustments>

      <riskLevelMapping>
        <map minScore="90" maxScore="100" riskLevel="critical"/>
        <map minScore="70" maxScore="89" riskLevel="high"/>
        <map minScore="40" maxScore="69" riskLevel="medium"/>
        <map minScore="0" maxScore="39" riskLevel="low"/>
      </riskLevelMapping>
    </riskScoring>
  </stateDefinitions>

  <screenSpecifications>
    <screen id="SCR-01" route="/assessments/new" name="작업 입력">
      <summary>
        <purpose>최소 입력으로 분석 시작</purpose>
        <layout ratio="7:5" columns="2"/>
        <leftArea>입력 폼 카드 1개</leftArea>
        <rightArea>서비스 설명, 예시 입력, 개인정보 유의 카드</rightArea>
        <primaryCta>AI 분석 시작</primaryCta>
      </summary>

      <fields>
        <field id="taskName" component="text-input" required="true" minLength="2" maxLength="60"/>
        <field id="taskDescription" component="textarea" required="true" minLength="20" maxLength="1000"/>
        <field id="siteName" component="text-input" required="false" minLength="0" maxLength="60"/>
        <field id="workDate" component="date-picker" required="false" allowFutureDate="false"/>
        <field id="photos" component="file-upload" required="false" maxFiles="5"/>
      </fields>

      <interactionRules>
        <rule id="scr01-rule-01">taskName과 taskDescription 유효성 통과 전에는 CTA 비활성화</rule>
        <rule id="scr01-rule-02">첫 입력 후 10초마다 자동 저장</rule>
        <rule id="scr01-rule-03">미저장 변경이 있으면 페이지 이탈 시 확인 모달 표시</rule>
        <rule id="scr01-rule-04">분석 시작 후 전용 로딩 상태로 전환하고 SCR-02로 자동 이동</rule>
      </interactionRules>

      <loadingState>
        <type>전체 화면 중앙 로더</type>
        <progressMessages>
          <message order="1">텍스트 분석 중</message>
          <message order="2">사진 분석 중</message>
          <message order="3">작업 프로필 정리 중</message>
        </progressMessages>
      </loadingState>

      <errorHandling>
        <error id="scr01-error-01">텍스트 길이 부족 시 입력 하단에 즉시 오류 표시</error>
        <error id="scr01-error-02">업로드 실패 시 해당 파일명을 포함한 오류 토스트 표시</error>
        <error id="scr01-error-03">Gemini 호출 실패 시 다시 시도와 입력 유지 버튼 제공</error>
      </errorHandling>
    </screen>

    <screen id="SCR-02" route="/assessments/:id/profile-review" name="AI 분석 확인">
      <summary>
        <purpose>AI 구조화 결과 검토 및 사용자 확정</purpose>
        <layout mainColumns="8" summaryColumns="4"/>
        <primaryCta>분석 결과 확정</primaryCta>
        <secondaryCtas>
          <cta>재분석</cta>
          <cta>입력 수정</cta>
        </secondaryCtas>
      </summary>

      <sections>
        <section id="task-overview">작업명, 설명 원문 읽기 전용</section>
        <section id="structured-profile">업종, 작업장소, 장비, 위험요인 수정 가능</section>
        <section id="additional-settings">외국인 근로자 여부, 숙련도 수준, 메모</section>
      </sections>

      <editableFields>
        <field id="industry" component="searchable-select" required="true" selectionMode="single"/>
        <field id="workLocation" component="searchable-select-with-free-text" required="true" minSelections="1"/>
        <field id="equipment" component="multi-tag-input" required="true" minSelections="1" maxSelections="5" allowValue="없음"/>
        <field id="hazards" component="multi-tag-input" required="true" minSelections="1" maxSelections="8"/>
        <field id="foreignWorker" component="toggle" required="false" defaultValue="false"/>
        <field id="experienceLevel" component="single-select" required="false">
          <options>
            <option>초급</option>
            <option>혼합</option>
            <option>숙련</option>
          </options>
        </field>
      </editableFields>

      <confidenceRules>
        <rule id="scr02-confidence-01">각 AI 추론값 우측에 confidence badge 표시</rule>
        <rule id="scr02-confidence-02">low 신뢰도 항목은 빨간 점선 테두리와 확인 필요 라벨 표시</rule>
        <rule id="scr02-confidence-03">low 항목이 1개라도 남아 있으면 상단 배너 표시</rule>
      </confidenceRules>

      <progressionRules>
        <rule id="scr02-progress-01">industry, workLocation, equipment, hazards 확정 시에만 분석 결과 확정 활성화</rule>
        <rule id="scr02-progress-02">재분석은 기존 수정값을 버리고 SCR-01 입력값 기준으로 다시 실행</rule>
      </progressionRules>
    </screen>

    <screen id="SCR-03" route="/assessments/:id/analysis" name="분석 결과">
      <summary>
        <purpose>현재 작업의 위험 수준과 즉시 조치 확인</purpose>
        <layout topBand="true" mainRatio="8:4"/>
        <primaryCta>근거 확인</primaryCta>
      </summary>

      <metricBand>
        <metricCard id="risk-level-card">위험등급, 점수, 한 줄 판정</metricCard>
        <metricCard id="fatality-match-card">유사 사고사망 사례 건수</metricCard>
        <metricCard id="immediate-actions-card">지금 해야 할 조치 수</metricCard>
        <metricCard id="report-ready-card">보고서 생성 가능 여부</metricCard>
      </metricBand>

      <bodyLayout>
        <mainArea>사고 시나리오, 주요 위험요인, 권장 개선조치</mainArea>
        <sideArea>확정된 작업 프로필, 선택 근거 수, 분석 상태</sideArea>
      </bodyLayout>

      <contentRules>
        <rule id="scr03-content-01">사고 시나리오는 120~240자 문장 1개로 고정</rule>
        <rule id="scr03-content-02">즉시 조치는 최대 5개 항목만 노출</rule>
        <rule id="scr03-content-03">권장 개선조치는 행동 동사로 시작하는 문장으로 통일</rule>
        <rule id="scr03-content-04">위험등급이 critical이면 상단 고정 배너 표시</rule>
      </contentRules>
    </screen>

    <screen id="SCR-04" route="/assessments/:id/evidence" name="근거 화면">
      <summary>
        <purpose>사례, 사망사고, 법령 근거 확인 및 선택</purpose>
        <layout mainColumns="9" citationRailColumns="3"/>
        <primaryCta>교육 자료 보기</primaryCta>
      </summary>

      <tabs>
        <tab id="case" name="유사 재해사례" defaultVisible="true"/>
        <tab id="fatality" name="사고사망 사례" autoPriorityWhen="riskLevel=high or riskLevel=critical"/>
        <tab id="law" name="법령·KOSHA Guide" defaultVisible="true"/>
      </tabs>

      <filterBar>
        <control id="keyword-chip-editor">검색 키워드 칩 편집</control>
        <control id="industry-filter">업종 필터 표시</control>
        <control id="relevance-sort">관련도 정렬 선택</control>
        <control id="hide-excluded-toggle">제외한 결과 숨기기</control>
      </filterBar>

      <commonEvidenceCard>
        <field name="title" rule="최대 2줄"/>
        <field name="sourceBadge" rule="재해사례, 사고사망, 법령, Guide 중 1개"/>
        <field name="relevanceScore" rule="0~100 정수"/>
        <field name="summary" rule="최대 3개 불릿"/>
        <field name="keywords" rule="최대 4개 칩"/>
        <field name="actions" rule="원문 보기, 보고서에 인용, 제외"/>
      </commonEvidenceCard>

      <fatalityCardExtraFields>
        <field name="incidentDate" format="YYYY-MM-DD"/>
        <field name="place" rule="최대 1줄"/>
        <field name="casualtyScale" format="사망 n명 / 부상 n명"/>
        <field name="standardAccidentType" allowedValues="추락, 끼임, 붕괴, 질식, 폭발, 화학노출"/>
      </fatalityCardExtraFields>

      <lawCardExtraFields>
        <field name="documentType" allowedValues="법령, 고시, 예규, Guide, 미디어"/>
        <field name="applicationPoints" rule="최대 2개 불릿"/>
        <field name="riskIfOmitted" rule="1문장"/>
      </lawCardExtraFields>

      <citationRailRules>
        <rule id="scr04-citation-01">사용자가 선택한 근거만 누적</rule>
        <rule id="scr04-citation-02">최대 12개 저장</rule>
        <rule id="scr04-citation-03">드래그 정렬 없이 선택 순서 유지</rule>
        <rule id="scr04-citation-04">같은 근거는 중복 추가 금지</rule>
      </citationRailRules>
    </screen>

    <screen id="SCR-05" route="/assessments/:id/materials" name="교육 화면">
      <summary>
        <purpose>교육자료 추천, 언어 조건 반영, 브리핑 첨부</purpose>
        <layout mainColumns="9" filterColumns="3"/>
        <primaryCta>문서 작성으로 이동</primaryCta>
      </summary>

      <rightFilters>
        <field id="materialType" component="multi-select" allowedValues="책자, OPS, 교안, 영상, 외국어 자료"/>
        <field id="language" component="single-select" defaultValue="한국어"/>
        <field id="priorityMode" component="single-select" allowedValues="즉시교육, 작업전 브리핑, 참고자료"/>
      </rightFilters>

      <materialCard>
        <minimumHeightPx>160</minimumHeightPx>
        <leftIconArea widthPx="72" heightPx="72"/>
        <titleRule>최대 2줄</titleRule>
        <recommendReasonRule>최대 60자</recommendReasonRule>
        <actions>
          <action>새 탭에서 열기</action>
          <action>브리핑 포함</action>
          <action>제외</action>
        </actions>
      </materialCard>

      <sortingRules>
        <rule id="scr05-sort-01">위험등급 critical, high에서는 영상 &gt; OPS &gt; 교안 &gt; 책자 순</rule>
        <rule id="scr05-sort-02">foreignWorker=true이면 외국어 자료를 최상단 그룹으로 배치</rule>
        <rule id="scr05-sort-03">제외한 자료는 현재 세션에서 재노출하지 않음</rule>
      </sortingRules>
    </screen>

    <screen id="SCR-06" route="/assessments/:id/report" name="문서 출력">
      <summary>
        <purpose>위험성평가서 초안 편집, 미리보기, 저장</purpose>
        <layout editorColumns="6" previewColumns="6"/>
        <primaryCta>PDF 저장</primaryCta>
        <secondaryCtas>
          <cta>DOCX 저장</cta>
          <cta>내용 복사</cta>
        </secondaryCtas>
      </summary>

      <documentSections>
        <section order="1">문서 헤더</section>
        <section order="2">작업 개요</section>
        <section order="3">작업 프로필</section>
        <section order="4">주요 위험요인</section>
        <section order="5">위험등급 및 즉시 조치</section>
        <section order="6">유사 재해사례 요약</section>
        <section order="7">사고사망 기반 경고</section>
        <section order="8">법령 및 KOSHA Guide 근거</section>
        <section order="9">권장 개선조치</section>
        <section order="10">작업 전 체크리스트</section>
        <section order="11">추천 교육자료</section>
        <section order="12">작업 전 안전 브리핑 문안</section>
      </documentSections>

      <editingRules>
        <rule id="scr06-edit-01">섹션 제목은 고정, 수정 불가</rule>
        <rule id="scr06-edit-02">본문은 사용자가 직접 수정 가능</rule>
        <rule id="scr06-edit-03">체크리스트는 항목 추가 10개까지 허용</rule>
        <rule id="scr06-edit-04">브리핑 문안은 300자 이내 권장</rule>
        <rule id="scr06-edit-05">미리보기는 입력 즉시 우측에 실시간 반영</rule>
      </editingRules>

      <fileNamePatterns>
        <pattern format="pdf">RISK-GUARD_{taskName}_{YYYYMMDD}.pdf</pattern>
        <pattern format="docx">RISK-GUARD_{taskName}_{YYYYMMDD}.docx</pattern>
      </fileNamePatterns>

      <exportRules>
        <rule id="scr06-export-01">taskName, industry, hazards, riskLevel 없으면 내보내기 불가</rule>
        <rule id="scr06-export-02">근거 데이터 일부 누락 시에도 내보내기는 가능하되 누락 섹션에 근거 수집 실패 문구 삽입</rule>
      </exportRules>
    </screen>
  </screenSpecifications>

  <userFlows>
    <defaultFlow id="default-assessment-flow">
      <step order="1">사용자가 SCR-01에서 작업명과 설명을 입력한다.</step>
      <step order="2">필요 시 현장 사진을 업로드한다.</step>
      <step order="3">AI 분석 시작을 누른다.</step>
      <step order="4">시스템이 Gemini로 작업 프로필을 생성한다.</step>
      <step order="5">사용자가 SCR-02에서 업종, 작업장소, 장비, 위험요인을 확정한다.</step>
      <step order="6">시스템이 위험점수와 위험등급을 계산하고 SCR-03을 연다.</step>
      <step order="7">시스템이 KOSHA API 4종을 병렬 호출한다.</step>
      <step order="8">사용자가 SCR-04에서 근거를 검토하고 필요한 항목을 인용 목록에 담는다.</step>
      <step order="9">사용자가 SCR-05에서 교육자료를 선택한다.</step>
      <step order="10">시스템이 SCR-06에서 위험성평가서 초안을 생성한다.</step>
      <step order="11">사용자가 문서를 수정하고 저장 또는 복사한다.</step>
    </defaultFlow>

    <alternativeFlows>
      <flow id="alt-01">
        <condition>사진 없이 시작</condition>
        <handling>텍스트만으로 분석 진행</handling>
      </flow>
      <flow id="alt-02">
        <condition>AI 결과가 부정확</condition>
        <handling>SCR-02에서 수동 수정 후 확정</handling>
      </flow>
      <flow id="alt-03">
        <condition>재해사례 없음</condition>
        <handling>넓은 키워드 검색으로 1회 자동 재시도</handling>
      </flow>
      <flow id="alt-04">
        <condition>사고사망 사례 없음</condition>
        <handling>유사 사망사고 미검출 메시지 표시, 위험등급 유지</handling>
      </flow>
      <flow id="alt-05">
        <condition>법령 검색 실패</condition>
        <handling>사례와 AI 추론만으로 보고서 생성 허용</handling>
      </flow>
      <flow id="alt-06">
        <condition>내보내기 실패</condition>
        <handling>편집 내용 유지, 재시도 버튼 제공</handling>
      </flow>
    </alternativeFlows>
  </userFlows>

  <responsiveRules>
    <breakpoints>
      <breakpoint id="desktop-xl" minWidthPx="1600" behavior="3영역 전체 노출"/>
      <breakpoint id="desktop" minWidthPx="1280" maxWidthPx="1599" behavior="기본 레이아웃"/>
      <breakpoint id="desktop-sm" minWidthPx="1024" maxWidthPx="1279" behavior="우측 레일을 드로어로 전환"/>
      <breakpoint id="unsupported" maxWidthPx="1023" behavior="서비스 이용 제한 안내"/>
    </breakpoints>

    <breakpointRules>
      <rule target="desktop-xl">
        <leftRailWidthPx>264</leftRailWidthPx>
        <rightRailWidthPx>360</rightRailWidthPx>
        <cardGrid>2열 허용</cardGrid>
      </rule>
      <rule target="desktop">
        <leftRailWidthPx>240</leftRailWidthPx>
        <rightRailWidthPx>320</rightRailWidthPx>
        <cardGrid>메인 카드 1열 기본</cardGrid>
      </rule>
      <rule target="desktop-sm">
        <leftRailWidthPx>72</leftRailWidthPx>
        <leftRailMode>아이콘형 축소</leftRailMode>
        <rightRailMode>버튼 클릭 시 드로어 오픈</rightRailMode>
        <evidenceTabCardGapPx>12</evidenceTabCardGapPx>
      </rule>
      <rule target="unsupported">
        <screenMode>전체 앱 대신 차단 화면 노출</screenMode>
        <message>RISK-GUARD는 1024px 이상 데스크톱 환경에서 사용하도록 설계되었습니다.</message>
      </rule>
    </breakpointRules>
  </responsiveRules>

  <accessibility>
    <requiredCriteria>
      <criterion id="a11y-01">WCAG 2.2 AA 수준 준수</criterion>
      <criterion id="a11y-02">일반 텍스트 대비비 4.5:1 이상</criterion>
      <criterion id="a11y-03">큰 텍스트 대비비 3:1 이상</criterion>
      <criterion id="a11y-04">키보드만으로 전 화면 이동 가능</criterion>
      <criterion id="a11y-05">모달 오픈 시 focus trap 필수</criterion>
    </requiredCriteria>

    <keyboardInteractions>
      <interaction component="stepper">Tab, Shift+Tab, Enter로 이동</interaction>
      <interaction component="tab">좌우 화살표로 전환</interaction>
      <interaction component="tag-input">Backspace로 마지막 태그 삭제</interaction>
      <interaction component="modal">Esc 닫기 가능</interaction>
      <interaction component="upload">키보드 포커스로 파일 선택 가능</interaction>
    </keyboardInteractions>

    <screenReaderRules>
      <rule id="sr-01">위험등급 배지는 위험등급: 높음처럼 완전한 문장으로 읽혀야 함</rule>
      <rule id="sr-02">로딩 상태는 aria-live="polite"로 공지</rule>
      <rule id="sr-03">오류 메시지는 입력 필드와 aria-describedby로 연결</rule>
      <rule id="sr-04">아이콘 단독 버튼은 모두 aria-label 보유</rule>
    </screenReaderRules>

    <assistiveRules>
      <rule id="assistive-01">필수 입력은 색상 대신 필수 텍스트 라벨 함께 제공</rule>
      <rule id="assistive-02">결과 없음 상태는 빈 영역 대신 이유와 다음 행동을 함께 제공</rule>
      <rule id="assistive-03">링크는 모두 새 창 열림 여부를 시각적으로 표시</rule>
    </assistiveRules>
  </accessibility>

  <exceptionHandling>
    <exception id="exception-01">
      <condition>Gemini 분석 타임아웃</condition>
      <detection>45초 초과</detection>
      <uiHandling>상단 오류 배너 + 재시도 버튼</uiHandling>
      <followUp>입력값 유지</followUp>
    </exception>
    <exception id="exception-02">
      <condition>이미지 포맷 오류</condition>
      <detection>허용 포맷 아님</detection>
      <uiHandling>업로드 즉시 차단</uiHandling>
      <followUp>파일 재선택</followUp>
    </exception>
    <exception id="exception-03">
      <condition>업로드 용량 초과</condition>
      <detection>10MB 초과</detection>
      <uiHandling>파일별 오류 표시</uiHandling>
      <followUp>업로드 취소</followUp>
    </exception>
    <exception id="exception-04">
      <condition>KOSHA API 일부 실패</condition>
      <detection>4개 중 일부 실패</detection>
      <uiHandling>실패한 카드만 partial 상태</uiHandling>
      <followUp>나머지 결과 유지</followUp>
    </exception>
    <exception id="exception-05">
      <condition>결과 없음</condition>
      <detection>ApiStatus=empty</detection>
      <uiHandling>빈 상태 일러스트 대신 문장 + 검색 확장 제안</uiHandling>
      <followUp>자동 재검색 1회</followUp>
    </exception>
    <exception id="exception-06">
      <condition>세션 만료</condition>
      <detection>인증 실패 또는 저장 실패</detection>
      <uiHandling>전체 화면 세션 만료 모달</uiHandling>
      <followUp>재로그인 후 초안 복구</followUp>
    </exception>
    <exception id="exception-07">
      <condition>페이지 이탈</condition>
      <detection>미저장 수정 존재</detection>
      <uiHandling>이탈 확인 모달</uiHandling>
      <followUp>저장 또는 취소</followUp>
    </exception>
    <exception id="exception-08">
      <condition>중복 클릭</condition>
      <detection>동일 액션 2회 이상 연속</detection>
      <uiHandling>버튼 loading 고정</uiHandling>
      <followUp>중복 요청 차단</followUp>
    </exception>
    <exception id="exception-09">
      <condition>파일 내보내기 실패</condition>
      <detection>PDF 또는 DOCX 생성 실패</detection>
      <uiHandling>토스트 + 오류 배너</uiHandling>
      <followUp>재시도</followUp>
    </exception>
    <exception id="exception-10">
      <condition>근거 0건인데 보고서 생성</condition>
      <detection>인용 목록 비어 있음</detection>
      <uiHandling>경고 배너 표시</uiHandling>
      <followUp>생성은 허용</followUp>
    </exception>
  </exceptionHandling>

  <implementationCheckpoints>
    <checkpoint id="checkpoint-01">위험등급은 색상, 아이콘, 라벨 3요소를 동시에 사용해야 한다.</checkpoint>
    <checkpoint id="checkpoint-02">모든 카드에는 출처 또는 데이터 상태가 보여야 한다.</checkpoint>
    <checkpoint id="checkpoint-03">SCR-02 이전에는 사용자가 AI 결과를 신뢰하고 넘어가도록 유도하지 않는다. 필수 확정 단계는 제거 금지다.</checkpoint>
    <checkpoint id="checkpoint-04">SCR-04와 SCR-05는 단순 링크 나열이 아니라 왜 추천되는지 설명이 반드시 들어가야 한다.</checkpoint>
    <checkpoint id="checkpoint-05">SCR-06은 읽기 전용 미리보기 화면이 아니라 수정 가능한 문서 작성 화면이어야 한다.</checkpoint>
  </implementationCheckpoints>

  <references>
    <reference id="ref-01" type="api" title="KOSHA 국내재해사례 게시판 정보 조회서비스" url="https://www.data.go.kr/data/15121001/openapi.do"/>
    <reference id="ref-02" type="api" title="KOSHA 사고사망 게시판 정보 조회서비스" url="https://www.data.go.kr/data/15119137/openapi.do"/>
    <reference id="ref-03" type="api" title="KOSHA 안전보건자료 링크 서비스" url="https://www.data.go.kr/data/15139398/openapi.do"/>
    <reference id="ref-04" type="api" title="KOSHA 안전보건법령 스마트검색 API" url="https://www.data.go.kr/data/15123696/openapi.do"/>
    <reference id="ref-05" type="ai-doc" title="Gemini 이미지 이해" url="https://ai.google.dev/gemini-api/docs/image-understanding"/>
    <reference id="ref-06" type="ai-doc" title="Gemini Structured Outputs / Function Calling" url="https://ai.google.dev/gemini-api/docs/function-calling"/>
  </references>
</riskGuardSpecification>
```
