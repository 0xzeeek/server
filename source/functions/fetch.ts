import { Resource } from "sst";
import { APIGatewayProxyHandlerV2, APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
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
    if (!agentId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "agentId is required" }),
      };
    }

    // get agent data from dynamodb
    const agentData = await ddb.send(new GetCommand({
      TableName: Resource.AgentData.name,
      Key: {
        agentId,
      },
    }));

    if (!agentData.Item) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Agent not found" }),
      };
    }

    const { password, ...rest } = agentData.Item;

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: rest }),
    };
  } catch (error) {
    console.error("Error in destroy handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "An error occurred",
      }),
    };
  }
};
