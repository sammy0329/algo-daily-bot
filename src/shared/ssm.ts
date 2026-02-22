import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { logger } from './logger';

const client = new SSMClient({});

/** SSM Parameter Store에서 SecureString 파라미터를 조회한다. */
export async function getSecureParameter(name: string): Promise<string> {
  const result = await client.send(
    new GetParameterCommand({
      Name: name,
      WithDecryption: true,
    }),
  );
  const value = result.Parameter?.Value;
  if (!value) throw new Error(`SSM 파라미터를 찾을 수 없습니다: ${name}`);
  return value;
}

/** SSM Parameter Store에 SecureString 파라미터를 저장한다. */
export async function putSecureParameter(name: string, value: string): Promise<void> {
  const { SSMClient: SSMClientClass, PutParameterCommand } = await import('@aws-sdk/client-ssm');
  const c = new SSMClientClass({});
  await c.send(
    new PutParameterCommand({
      Name: name,
      Value: value,
      Type: 'SecureString',
      Overwrite: true,
    }),
  );
  logger.info(`SSM 파라미터 저장 완료: ${name}`);
}
