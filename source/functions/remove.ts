import { Resource } from "sst";
import { APIGatewayProxyHandlerV2, APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
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

    // const agentId = event.pathParameters?.agentId;
    const agentId = event.queryStringParameters?.agentId;

    if (!agentId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "agentId is required in parameters" }),
      };
    }

    // Check if agent exists and get userId
    const existingAgentItem = await ddb.send(
      new GetCommand({
        TableName: Resource.AgentData.name,
        Key: { agentId },
      })
    );

    const existingAgent = existingAgentItem.Item;

    if (!existingAgent) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Agent not found" }),
      };
    }

    const userId = existingAgent.user;

    // Mark agent as removed in AgentData table
    await ddb.send(
      new UpdateCommand({
        TableName: Resource.AgentData.name,
        Key: { agentId },
        UpdateExpression: "SET #remove = :remove, updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#remove": "remove",
        },
        ExpressionAttributeValues: {
          ":remove": "true",
          ":updatedAt": new Date().toISOString(),
        },
      })
    );

    // Delete records from all tables in parallel
    await Promise.all([
      // Delete from UserData table
      ddb.send(
        new DeleteCommand({
          TableName: Resource.UserData.name,
          Key: {
            userId,
            agentId,
          },
        })
      ),
      // Delete from AgentMapping table
      ddb.send(
        new DeleteCommand({
          TableName: Resource.AgentMapping.name,
          Key: {
            agentId,
          },
        })
      ),
      // Delete from AgentTwitterMapping table
      ddb.send(
        new DeleteCommand({
          TableName: Resource.AgentTwitterMapping.name,
          Key: {
            username: existingAgent.username,
          },
        })
      ),
    ]);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Agent marked as removed",
      }),
    };
  } catch (error) {
    console.error("Error in remove handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "An error occurred",
      }),
    };
  }
};
