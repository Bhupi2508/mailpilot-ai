/**
 * Swagger / OpenAPI configuration.
 *
 * Served at GET /api/docs. Groups endpoints by tag, provides a JWT
 * authorization button, request/response schemas, JSON + multipart examples,
 * and validation-error examples.
 */
const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "MailPilot AI API",
      version: "2.0.0",
      description:
        "Backend API for MailPilot AI — an email sending platform (NOT an email provider). " +
        "Users connect their own mailbox (Google first, Outlook later) and send emails " +
        "through their own account. The frontend only ever receives the MailPilot JWT; " +
        "provider tokens are stored encrypted server-side and never exposed.",
      contact: {
        name: "MailPilot AI",
      },
      license: {
        name: "MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:3400/api",
        description: "Local development server",
      },
    ],
    tags: [
      { name: "OAuth", description: "Provider sign-in (Google first)" },
      { name: "Emails", description: "Email sending & history endpoints" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Paste your MailPilot JWT access token here.",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            google_id: { type: "string", nullable: true },
            name: { type: "string" },
            email: { type: "string", format: "email" },
            profile_picture: { type: "string", nullable: true },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        ConnectedAccount: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            user_id: { type: "string", format: "uuid" },
            provider: { type: "string", example: "google" },
            provider_email: { type: "string", format: "email" },
            token_expiry: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            scopes: { type: "array", items: { type: "string" } },
            is_active: { type: "boolean" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
          },
        },
        SendEmailRequest: {
          type: "object",
          required: ["subject", "to", "body"],
          properties: {
            subject: { type: "string", maxLength: 200, example: "Hello team" },
            to: {
              type: "array",
              items: { type: "string", format: "email" },
              description:
                "Recipients (array, or comma/newline/pipe separated string).",
              example: ["a@example.com", "b@example.com"],
            },
            cc: {
              type: "array",
              items: { type: "string", format: "email" },
              description: "Optional CC recipients.",
            },
            bcc: {
              type: "array",
              items: { type: "string", format: "email" },
              description: "Optional BCC recipients.",
            },
            body: {
              type: "string",
              description: "Email body (HTML or plain text).",
            },
            body_type: {
              type: "string",
              enum: ["html", "text"],
              default: "html",
              description: "Body type. Defaults to html.",
            },
            provider: {
              type: "string",
              enum: ["auto", "smtp", "gmail_api"],
              default: "auto",
            },
            account_id: {
              type: "string",
              format: "uuid",
              description:
                "Specific connected account to send from (optional).",
            },
          },
        },
        SendEmailResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Email sent successfully." },
            data: {
              type: "object",
              properties: {
                emailId: { type: "string", format: "uuid" },
                messageId: { type: "string" },
                provider: { type: "string", example: "gmail_api" },
                recipient: { type: "string", nullable: true },
              },
            },
          },
        },
        SendIndividualResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Emails sent successfully." },
            data: {
              type: "object",
              properties: {
                emails: {
                  type: "array",
                  items: { $ref: "#/components/schemas/SendEmailResponse" },
                },
                total: { type: "number" },
                sent: { type: "number" },
                failed: { type: "number" },
              },
            },
          },
        },
        ValidationError: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string", example: "Validation failed." },
            details: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  field: { type: "string", example: "to" },
                  message: { type: "string" },
                  value: { type: "string" },
                },
              },
            },
          },
        },
        EmailHistory: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            provider: { type: "string" },
            provider_message_id: { type: "string", nullable: true },
            subject: { type: "string" },
            body: { type: "string", nullable: true },
            body_type: { type: "string", enum: ["html", "text"] },
            to_recipients: { type: "array", items: { type: "string" } },
            cc_recipients: { type: "array", items: { type: "string" } },
            bcc_recipients: { type: "array", items: { type: "string" } },
            sending_mode: { type: "string", enum: ["shared", "individual"] },
            attachment_count: { type: "integer" },
            attachment_names: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["pending", "sent", "failed"] },
            error_message: { type: "string", nullable: true },
            sent_at: { type: "string", format: "date-time", nullable: true },
            created_at: { type: "string", format: "date-time" },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ["./src/routes/*.js", "./src/controllers/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
