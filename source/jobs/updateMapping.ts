import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { Resource } from "sst";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

export async function handler(event: any) {
  const taskArn = event.detail.taskArn;

  // 1) Query all items that share this taskArn
  const queryRes = await ddb.send(
    new QueryCommand({
      TableName: Resource.AgentMapping.name,
      IndexName: "byTaskArn",
      KeyConditionExpression: "#taskArn = :taskArnVal",
      ExpressionAttributeNames: {
        "#taskArn": "taskArn",
      },
      ExpressionAttributeValues: {
        ":taskArnVal": taskArn,
      },
    })
  );

  if (!queryRes.Items || queryRes.Items.length === 0) {
    console.log(`No items found for taskArn = ${taskArn}`);
    return;
  }

  // 2) For each item, call UpdateCommand using BOTH taskArn + agentId
  for (const item of queryRes.Items) {
    await ddb.send(
      new UpdateCommand({
        TableName: Resource.AgentMapping.name,
        Key: {
          agentId: item.agentId,
        },
        UpdateExpression: "SET #st = :st",
        ExpressionAttributeNames: {
          "#st": "status",
        },
        ExpressionAttributeValues: {
          ":st": "STOPPED",
        },
      })
    );
  }

  console.log(`All records for taskArn ${taskArn} updated to STOPPED`);
}
