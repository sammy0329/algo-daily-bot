/**
 * AI 설정 스크립트
 * 사용법: ts-node scripts/setup-ai.ts --provider gpt --model gpt-4o-mini --api-key sk-...
 *
 * 지원 제공자:
 *   gpt    → gpt-4o-mini, gpt-4o, gpt-4-turbo
 *   claude → claude-haiku-4-5, claude-sonnet-4-6, claude-opus-4-6
 *   gemini → gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro
 *
 * 실행 전 환경변수 설정 필요:
 *   TABLE_NAME=AlgoDailyBotTable
 *   AWS_REGION=ap-northeast-2
 */

import { upsertAIConfig } from '../src/shared/dynamodb';
import { putSecureParameter } from '../src/shared/ssm';
import { SSM_PATHS, SUPPORTED_PROVIDERS, PROVIDER_MODELS, AIProvider } from '../src/shared/constants';

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const provider = args['provider'] as AIProvider;
  const model = args['model'];
  const apiKey = args['api-key'];

  if (!provider || !model || !apiKey) {
    console.error('사용법: ts-node scripts/setup-ai.ts --provider <제공자> --model <모델> --api-key <키>');
    console.error('\n지원 제공자 및 모델:');
    for (const p of SUPPORTED_PROVIDERS) {
      console.error(`  ${p}: ${PROVIDER_MODELS[p].join(', ')}`);
    }
    process.exit(1);
  }

  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    console.error(`지원하지 않는 제공자: ${provider}`);
    console.error(`지원 제공자: ${SUPPORTED_PROVIDERS.join(', ')}`);
    process.exit(1);
  }

  if (!process.env.TABLE_NAME) {
    console.error('TABLE_NAME 환경변수를 설정해주세요.');
    process.exit(1);
  }

  console.log(`\n🤖 AI 설정 시작`);
  console.log(`  제공자: ${provider}`);
  console.log(`  모델: ${model}`);
  console.log(`  API 키: ${apiKey.slice(0, 8)}...\n`);

  // 1. API 키를 SSM Parameter Store에 저장
  console.log('1️⃣  API 키를 SSM Parameter Store에 저장 중...');
  await putSecureParameter(SSM_PATHS.AI_API_KEY, apiKey);
  console.log(`   ✅ 저장 완료: ${SSM_PATHS.AI_API_KEY}\n`);

  // 2. AI 설정을 DynamoDB에 저장
  console.log('2️⃣  AI 설정을 DynamoDB에 저장 중...');
  await upsertAIConfig({
    provider,
    model,
    apiKeyParam: SSM_PATHS.AI_API_KEY,
  });
  console.log('   ✅ 설정 저장 완료\n');

  console.log('🎉 AI 설정 완료!\n');
  console.log(`  제공자: ${provider}`);
  console.log(`  모델: ${model}`);
  console.log('\n변경하려면 동일 스크립트를 다시 실행하세요. Lambda 재배포는 불필요합니다.\n');
}

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--') && i + 1 < argv.length) {
      result[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return result;
}

main().catch((err) => {
  console.error('오류 발생:', err);
  process.exit(1);
});
