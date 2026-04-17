# 안전보건공단 국내재해사례 게시판 조회서비스

## Open API 활용가이드

## 목차

- 1. 서비스 명세 (3p)

- 1.1 국내재해사례 게시판 조회서비스 (3p)

- 가. API 서비스 개요 (3p)

- 나. 상세기능 목록 (4p)

- 다. 상세기능내역 (4p)

- 1) [국내재해사례 게시판 조회] 상세기능명세 (4p)

## 1. 서비스 명세

### 1.1 국내재해사례 게시판 정보 조회서비스

#### 가. API 서비스 개요

| Col1 | Col2 | Col3 | Col4 | Col5 |
| --- | --- | --- | --- | --- |
| API 서비스 정보 | API명(영문) |   |   |   |
|   | API명(국문) | 국내재해사례 게시판 조회서비스 |   |   |
|   | API 설명 | 한국산업안전보건공단 홈페이지(www.kosha.or.kr)에서 제공 중인 국내재해사례 게시판 정보를 실시간으로 조회하실 수 있도록 제공하는 데이터입니다. |   |   |
| API 서비스<br>보안적용<br>기술 수준 | 서비스 인증/권한 | [O] ServiceKey [ ] 인증서 (GPKI/NPKI)<br>[ ] Basic (ID/PW) [ ] 없음 |   |   |
|   | 메시지 레벨<br>암호화 | [ ] 전자서명 [ ] 암호화 [O] 없음 |   |   |
|   | 전송 레벨 암호화 | [ ] SSL [O] 없음 |   |   |
|   | 인터페이스 표준 | [ ] SOAP 1.2<br>(RPC-Encoded, Document Literal, Document Literal Wrapped)<br>[O] REST (GET)<br>[ ] RSS 1.0 [ ] RSS 2.0 [ ] Atom 1.0 [ ] 기타 |   |   |
|   | 교환 데이터 표준<br>(중복선택가능) | [ ] XML [O] JSON [ ] MIME [ ] MTOM |   |   |
| API 서비스<br>배포정보 | 서비스 URL | http://apis.data.go.kr/B552468/disaster_api |   |   |
|   | 서비스 명세 URL<br>(WSDL 또는 WADL) | N/A |   |   |
|   | 서비스 버전 | 1.0 |   |   |
|   | 서비스 시작일 | 2023-08-29 | 서비스 배포일 | 2025-09-24 |
|   | 서비스 이력 | 2023-08-29 : 서비스 시작 |   |   |
|   | 메시지 교환유형 | [O] Request-Response [ ] Publish-Subscribe<br>[ ] Fire-and-Forgot [ ] Notification |   |   |
|   | 서비스 제공자 | 디지털계획부/052-703-0587 |   |   |
|   | 데이터 갱신주기 | 수시 |   |   |

#### 나. 상세기능 목록

| Col1 | Col2 | Col3 | Col4 |
| --- | --- | --- | --- |
| 번호 | API명(국문) | 상세기능명(영문) | 상세기능명(국문) |
| 1 | 국내재해사례 게시판 조회 서비스 | disaster_api | 국내재해사례 게시판 조회 |

#### 다. 상세기능내역

##### 1) [국내재해사례 게시판 조회] 상세기능명세

###### a) 상세기능정보

| Col1 | Col2 | Col3 | Col4 |
| --- | --- | --- | --- |
| 상세기능 번호 | 1 | 상세기능 유형 | 조회 (목록) |
| 상세기능명(국문) | 국내재해사례 게시판 조회 |   |   |
| 상세기능 설명 | 게시판 번호, 종류, 제목 조건을 이용하여 국내재해사례 게시판의 제목과 내용 정보를 조회하는 기능 |   |   |
| Call Back URL | http://apis.data.go.kr/B552468/disaster_api/getDisaster_api |   |   |
| 최대 메시지 사이즈 | [1600] byte |   |   |
| 평균 응답 시간 | [180] ms | 초당 최대 트랙잭션 | [30] tps |

###### b) 요청 메시지 명세

| Col1 | Col2 | Col3 | Col4 | Col5 | Col6 |
| --- | --- | --- | --- | --- | --- |
| 항목명(영문) | 항목명(국문) | 항목크기 | 항목구분 | 샘플데이터 | 항목설명 |
| ServiceKey | 인증키 | 100 | 1 | 인증키<br>(URL Encode) | 공공데이터포털에서 발급받은 인증키 |
| pageNo | 페이지 번호 | 4 | 1 | 1 | 페이지 번호<br>Default: 1 |
| numOfRows | 한 페이지 결과 수 | 4 | 10 | 10 | 한 페이지 결과 수 Default: 10 |
| business | 게시판 종류 | 128 |   | 제조업 | 사망사고 게시판 종류 |
| keyword | 게시판 제목 | 500 |   | 지게차 | 사망사고 게시판 제목 |

※ 항목구분 : 필수(1), 옵션(0), 1건 이상 복수건(1..n), 0건 또는 복수건(0..n)

###### c) 응답 메시지 명세

| Col1 | Col2 | Col3 | Col4 | Col5 | Col6 |
| --- | --- | --- | --- | --- | --- |
| 항목명(영문) | 항목명(국문) | 항목크기 | 항목구분 | 샘플데이터 | 항목설명 |
| resultCode | 결과 코드 | 2 | 1 | 00 | 결과코드 |
| resultMsg | 결과 메시지 | 100 | 1 | NORMAL_CODE | 결과메시지 |
| boardno | 게시판 번호 | 38 | 정수 | 268511 | 사망사고 게시판 번호 |
| business | 게시판 이름 | 128 | 문자 | 제조업 | 사망사고 게시판 종류 이름 |
| keyword | 제목 | 500 | 문자 | 지게차가 전도되어 협착 | 사망사고 게시판 제목 |
| contents | 내용 | 4000 | 문자 | 1"<PRE> 제목 : 지게차가 전도되어 협착<br>업종 : 금속제품제조업<br>기인물 : 지게차<br>..... | 사망사고 게시판 내용 |
| totalCount | 총건수 | 10 | 정수 | 19 | 검색결과 총건수 |
| numOfRows | 한 페이지 결과수 | 4 | 정수 | 10 | 한 페이지당 표출 데이터 수 |
| pageNo | 페이지 번호 | 4 | 정수 | 1 | 페이지 번호 |

※ 항목구분 : 필수(1), 옵션(0), 1건 이상 복수건(1..n), 0건 또는 복수건(0..n), 코드표별첨

###### d) 요청/응답 메시지 예제

**요청메시지**

```
http://apis.data.go.kr/B552468/disaster_api/getDisaster_api?ServiceKey=서비스키&business=제조업&keyword=지게차&numOfRows=10&pageNo=1
https://www.kosha.or.kr/kosha/disaster_api.do?SG_APIM=인증키&business=제조업&keyword=지게차&numOfRows=10&pageNo=1
```

**응답메시지**

```json
{
"header":{
"resultMsg":"NORMAL_CODE",
"resultCode":"00"
},
"body":{
"items":{
"item":[{
"keyword":"지게차가 전도되어 협착",
"contents":"<PRE> 제목 : 지게차가 전도되어 협착\n 업종 : 금속제품제조업\n 기인물....",
"business":"제조업",
"boardno":"268511"
},
......
]},
"totalCount":10,
"pageNo":"1",
"numOfRows":"10"
}
}
```

※ Open API 에러 코드 정리

| Col1 | Col2 | Col3 |
| --- | --- | --- |
| 에러코드 | 에러메세지 | 설명 |
| 00 | NORMAL_SERVICE | 정상 |
| 01 | APPLICATION_ERROR | 어플리케이션 에러 |
| 02 | DB_ERROR | 데이터베이스 에러 |
| 03 | NODATA_ERROR | 데이터없음 에러 |
| 04 | HTTP_ERROR | HTTP 에러 |
| 05 | SERVICETIME_OUT | 서비스 연결실패 에러 |
| 10 | INVALID_REQUEST_PARAMETER_ERROR | 잘못된 요청 파라메터 에러 |
| 11 | NO_MANDATORY_REQUEST_PARAMETERS_ERROR | 필수요청 파라메터가 없음 |
| 12 | NO_OPENAPI_SERVICE_ERROR | 해당 오픈API서비스가 없거나 폐기됨 |
| 20 | SERVICE_ACCESS_DENIED_ERROR | 서비스 접근거부 |
| 21 | TEMPORARILY_DISABLE_THE_SERVICEKEY_ERROR | 일시적으로 사용할 수 없는 서비스 키 |
| 22 | LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR | 서비스 요청제한횟수 초과에러 |
| 30 | SERVICE_KEY_IS_NOT_REGISTERED_ERROR | 등록되지 않은 서비스키 |
| 31 | DEADLINE_HAS_EXPIRED_ERROR | 기한만료된 서비스키 |
| 32 | UNREGISTERED_IP_ERROR | 등록되지 않은 IP |
| 33 | UNSIGNED_CALL_ERROR | 서명되지 않은 호출 |
| 99 | UNKNOWN_ERROR | 기타에러 |
