import { Content, Container, Grid, Wrapper, Flex } from "@scute/ui";
import { AppLayout } from "@/components/shared/AppLayout";
import { AppCard } from "@/components/applications/AppCard";
import { ScuteApp } from "@/types/app";
import { NewAppDialog } from "@/components/applications/NewAppDialog";

export default function Apps() {
  const apps = [] as any;
  return (
    <AppLayout>
      <Wrapper>
        <Content css={{ bc: "white", py: "$6" }}>
          <Container size="3">
            {apps && apps.length > 0 ? (
              <Flex css={{ fd: "column", gap: "$5" }}>
                <Grid columns={3} gap={6}>
                  {
                    apps.map((app: ScuteApp, index: number) => (
                      <AppCard key={index} app={app} />
                    ))
                  }
                </Grid>
                <Flex>
                  <NewAppDialog />
                </Flex>
              </Flex>
            ) : (
              <EmptyState />
            )}

            {/* {JSON.stringify(apps)} */}
          </Container>
        </Content>
      </Wrapper>
    </AppLayout>
  );
}

const EmptyState = () => {
  return (
    <Flex css={{ fd: "column", jc: "center", ai: "center", width: "100%" }}>
      <div>
        <img
          style={{ maxWidth: "260px", opacity: "0.7" }}
          src="/blank.png"
          alt="no apps"
        />
      </div>
      <Flex css={{ fd: "column", ai: "center" }}>
        <h2>No apps yet</h2>
        <p>Create an app to experience Scute</p>
        <Flex>
          <NewAppDialog />
        </Flex>
      </Flex>
    </Flex>
  );
};
