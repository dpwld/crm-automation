# CRM Automation

[English](README.md) · 한국어

고객·연락처·영업 파이프라인·맞춤 spec sheet 관리를 위한 웹서비스입니다. 화면과 시스템 안내는 영어이며, 사용자가 입력하거나 가져온 원본 자료의 언어는 유지합니다.

## 설치

Git과 Node.js 22.13 이상을 준비하세요. 현재 저장소는 비공개이므로 접근 권한이 필요합니다.

```sh
git clone https://github.com/dpwld/crm-automation.git
cd crm-automation
npm ci
npm run setup
npm run dev -- --port 4323
```

출력된 로컬 주소를 여세요. 로컬 실행에는 ChatGPT 계정이나 유료 API 키가 필요하지 않습니다. 처음 실행할 때 회사에서 사용하는 spec의 항목, 단위, 열 구성을 설정하세요. 회사 전용 템플릿이나 실제 데이터는 포함하지 않습니다.

- [필수 API·데이터·기능 설명](README.md)
- [설치·업데이트·문제 해결](docs/INSTALLATION.md)
- [본인 Cloudflare 계정에 배포](docs/SELF-HOSTING.md)
- [기여 방법](CONTRIBUTING.md)

README의 예시 화면은 가상 데이터입니다. 초기 데이터베이스는 비어 있으며, 본인의 데이터와 설정을 사용합니다.
