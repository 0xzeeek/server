// checks the mapping table for the agent container url
// sends a message to the container to destroy the agent
// deletes the mapping from the table

import { Resource } from "sst";
import { APIGatewayProxyHandlerV2, APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
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

    // Parse the update data from request body
    if (!event.body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Request body is required" }),
      };
    }

    const updateData = JSON.parse(event.body);

    // Build update expression and attribute values
    const updateExpressionParts: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    Object.entries(updateData).forEach(([key, value]) => {
      if (key !== "agentId") {
        // Prevent updating the primary key
        const attributeName = `#${key}`;
        const attributeValue = `:${key}`;
        updateExpressionParts.push(`${attributeName} = ${attributeValue}`);
        expressionAttributeNames[attributeName] = key;
        expressionAttributeValues[attributeValue] = value;
      }
    });

    // Add updatedAt timestamp
    const now = new Date().toISOString();
    updateExpressionParts.push("#updatedAt = :updatedAt");
    expressionAttributeNames["#updatedAt"] = "updatedAt";
    expressionAttributeValues[":updatedAt"] = now;

    if (updateExpressionParts.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "No valid fields to update" }),
      };
    }

    // Update the agent data in DynamoDB
    const updateResult = await ddb.send(
      new UpdateCommand({
        TableName: Resource.AgentData.name,
        Key: { agentId },
        UpdateExpression: `SET ${updateExpressionParts.join(", ")}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: updateResult.Attributes,
      }),
    };
  } catch (error) {
    console.error("Error in update handler:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: "An error occurred",
      }),
    };
  }
};
