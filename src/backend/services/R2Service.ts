import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const R2_ENDPOINT = process.env['R2_ENDPOINT'];
const R2_ACCESS_KEY_ID = process.env['R2_ACCESS_KEY_ID'];
const R2_SECRET_ACCESS_KEY = process.env['R2_SECRET_ACCESS_KEY'];
const R2_BUCKET_NAME = process.env['R2_BUCKET_NAME'];
const R2_PUBLIC_URL = process.env['R2_PUBLIC_URL'];

function getClient(): S3Client {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('R2 credentials are not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.');
  }
  return new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
}

function getBucketName(): string {
  if (!R2_BUCKET_NAME) {
    throw new Error('R2_BUCKET_NAME is not configured.');
  }
  return R2_BUCKET_NAME;
}

function getPublicUrl(): string {
  if (!R2_PUBLIC_URL) {
    throw new Error('R2_PUBLIC_URL is not configured.');
  }
  return R2_PUBLIC_URL.replace(/\/$/, '');
}

export class R2Service {
  /**
   * Upload a file buffer to R2 and return its public URL.
   */
  public static async uploadFile(buffer: Buffer, key: string, contentType: string): Promise<string> {
    const client = getClient();
    const bucket = getBucketName();

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    return `${getPublicUrl()}/${key}`;
  }

  /**
   * Delete an object from R2 by its key.
   */
  public static async deleteFile(key: string): Promise<void> {
    const client = getClient();
    const bucket = getBucketName();

    await client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
  }

  /**
   * Extract the R2 object key from a public URL.
   * Returns undefined if the URL does not belong to this R2 bucket.
   */
  public static extractKey(url: string): string | undefined {
    const publicUrl = getPublicUrl();
    if (url.startsWith(publicUrl + '/')) {
      return url.slice(publicUrl.length + 1);
    }
    return undefined;
  }
}
