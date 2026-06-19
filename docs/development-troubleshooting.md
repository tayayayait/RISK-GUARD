# 개발 환경 문제 해결

## Vite 504 `Outdated Optimize Dep`

사고 예측 화면은 lazy route에서 `@google/generative-ai`를 사용합니다. 이 의존성이 Vite 실행 중 뒤늦게 발견되면 dependency hash가 바뀌면서 기존 브라우저 요청이 HTTP 504로 폐기될 수 있습니다.

`vite.config.ts`는 `@google/generative-ai`를 `optimizeDeps.include`에 등록해 개발 서버 시작 시 미리 번들링합니다. 설정 변경 후 실행 중인 개발 서버가 자동 재시작되지 않았다면 다음 명령으로 다시 시작합니다.

```powershell
pnpm dev
```

문제가 남아 있으면 개발 서버를 종료한 상태에서 최적화 캐시를 제거한 뒤 다시 시작합니다.

```powershell
Remove-Item -Recurse -Force node_modules/.vite
pnpm dev
```
