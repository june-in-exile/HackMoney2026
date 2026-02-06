/**
 * Check ShieldEvents for the new pool
 */

const PACKAGE_ID = "0x4eb9e3cf56db2db6d31c2eb96c0fd6f63b14f798cd7e7ae624ee6bb1fef7ea10";
const POOL_ID = "0xf1321532fb61a4691bcbb30e5372488c9f72dbe40afb155902317d3860055e04";
const GRAPHQL_URL = "https://graphql.testnet.sui.io/graphql";

async function checkEvents() {
  const shieldEventType = `${PACKAGE_ID}::pool::ShieldEvent`;

  console.log(`Checking for ShieldEvents...`);
  console.log(`Package: ${PACKAGE_ID}`);
  console.log(`Pool: ${POOL_ID}`);
  console.log(`Event Type: ${shieldEventType}\n`);

  const query = `
    query ShieldEvents {
      events(first: 10, filter: { type: "${shieldEventType}" }) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          contents {
            json
          }
          transaction {
            digest
          }
        }
      }
    }
  `;

  try {
    const response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    const result = await response.json();

    if (result.errors) {
      console.error("❌ GraphQL Errors:", JSON.stringify(result.errors, null, 2));
      return;
    }

    const events = result.data?.events?.nodes || [];
    console.log(`✅ Found ${events.length} ShieldEvents\n`);

    if (events.length > 0) {
      console.log("Events:");
      events.forEach((event, i) => {
        const data = event.contents?.json;
        console.log(`\n${i + 1}. Transaction: ${event.transaction?.digest}`);
        console.log(`   Pool ID: ${data?.pool_id}`);
        console.log(`   Position: ${data?.position}`);
        console.log(`   Commitment: ${data?.commitment?.slice(0, 20)}...`);
      });
    } else {
      console.log("\n⚠️ No events found. Possible reasons:");
      console.log("1. GraphQL indexer hasn't indexed your transactions yet (wait 30-60 seconds)");
      console.log("2. Shield transactions failed");
      console.log("3. Package ID doesn't match deployed contract");
      console.log("\n💡 What to do:");
      console.log("- Check if your Shield transactions succeeded in Sui Explorer");
      console.log("- Wait a minute and refresh the frontend");
      console.log("- Verify PACKAGE_ID and POOL_ID match your deployment");
    }
  } catch (err) {
    console.error("❌ Failed to query:", err.message);
  }
}

checkEvents();
