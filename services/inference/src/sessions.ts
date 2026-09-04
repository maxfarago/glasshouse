import { DeleteItemCommand, DynamoDBClient, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import type { SignalSet } from "@glasshouse/schema";

const TABLE = process.env.GH_SESSIONS_TABLE ?? "gh_sessions";
const ddb = new DynamoDBClient({});

export async function putSession(sid: string, signals: SignalSet): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await ddb.send(
    new PutItemCommand({
      TableName: TABLE,
      Item: marshall(
        {
          sid,
          signals,
          created_at: now,
          ttl: now + 3600,
        },
        { removeUndefinedValues: true },
      ),
    }),
  );
}

export async function mergeSignals(sid: string, signals: SignalSet): Promise<void> {
  await ddb.send(
    new UpdateItemCommand({
      TableName: TABLE,
      Key: marshall({ sid }),
      UpdateExpression: "SET signals = :s",
      ExpressionAttributeValues: marshall({ ":s": signals }, { removeUndefinedValues: true }),
    }),
  );
}

export async function deleteSession(sid: string): Promise<void> {
  await ddb.send(
    new DeleteItemCommand({
      TableName: TABLE,
      Key: marshall({ sid }),
    }),
  );
}
