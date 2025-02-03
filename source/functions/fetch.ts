import { Resource } from "sst";
import { APIGatewayProxyHandlerV2, APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, ScanCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { checkApiKey } from "./utils/auth";

const client = new DynamoDBClient({});
const ddb = DynamoDBDocumentClient.from(client);

export const handler: APIGatewayProxyHandlerV2 = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  try {
    // TODO: implement auth
    // const authError = checkApiKey(event);
    // if (authError) return authError;

    const agentId = event.queryStringParameters?.agentId;
    const userId = event.queryStringParameters?.userId;

    if (userId) {
      const userData = await ddb.send(
        new ScanCommand({
          TableName: Resource.UserData.name,
          FilterExpression: "userId = :userId",
          ExpressionAttributeValues: {
            ":userId": userId,
          },
        })
      );

      if (!userData.Items) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "User not found" }),
        };
      }

      const userAgentData = [];

      for (const item of userData.Items) {
        const agentData = await getAgentData(item.agentId);

        userAgentData.push(agentData);
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: userAgentData }),
      };
    } else if (agentId) {
      const agentData = await getAgentData(agentId);

      if (!agentData) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Agent not found" }),
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, data: agentData }),
      };
    }

    const activeAgents = await getActiveAgents();

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: activeAgents }),
    };
  } catch (error) {
    console.error("Error in fetch handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "An error occurred",
      }),
    };
  }
};

const getAgentData = async (agentId: string) => {
  const agentData = await ddb.send(
    new GetCommand({
      TableName: Resource.AgentData.name,
      Key: {
        agentId,
      },
    })
  );

  if (!agentData.Item) {
    return null;
  }

  const { password, ...rest } = agentData.Item;

  return rest;
};

const getActiveAgents = async () => {
  const result = await ddb.send(
    new QueryCommand({
      TableName: Resource.AgentData.name,
      IndexName: "byRemovalStatus",
      KeyConditionExpression: "#remove = :val",
      ExpressionAttributeNames: {
        "#remove": "remove",
      },
      ExpressionAttributeValues: {
        ":val": "false",
      },
    })
  );

  return result.Items;
};
