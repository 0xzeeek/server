import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import axios from "axios";
import { Resource } from "sst";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

// A Lambda function that runs on a schedule (cron) to find all items with status=STOPPED
export async function handler() {
  try {
    const response = await ddb.send(
      new QueryCommand({
        TableName: Resource.AgentMapping.name,
        IndexName: "byStatus",
        KeyConditionExpression: "#st = :stopped",
        ExpressionAttributeNames: {
          "#st": "status",
        },
        ExpressionAttributeValues: {
          ":stopped": "STOPPED",
        },
      })
    );

    const items = response.Items || [];

    for (const item of items) {
      // remove item from mapping tavble
      await ddb.send(
        new DeleteCommand({
          TableName: Resource.AgentMapping.name,
          Key: {
            agentId: item.agentId,
          },
        })
      );

      // get agent from db
      const agentItem = await ddb.send(
        new GetCommand({
          TableName: Resource.AgentData.name,
          Key: {
            agentId: item.agentId,
          },
        })
      );

      const agent = agentItem.Item;

      if (!agent) {
        console.error(`Agent not found for agentId: ${item.agentId}`);
        continue;
      }

      console.log("STARTING AGENT", agent.agentId);

      await axios.post(`${Resource.AgentApi.url}/start`, {
        agentId: agent.agentId,
        characterFile: agent.characterFile,
        twitterCredentials: {
          username: agent.username,
          email: agent.email,
          password: agent.password,
        },
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: items,
      }),
    };
  } catch (error) {
    console.error("Error querying STOPPED tasks:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error }),
    };
  }
}
