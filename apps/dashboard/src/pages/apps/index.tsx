import Head from "next/head";
import Image from "next/image";
import {
  Flex,
  Text,
  Button,
  Container,
  Inset,
  Card,
  Box,
} from "@radix-ui/themes";
import { Layout } from "@/components/shared/Layout";
import { AppCard } from "@/components/apps/AppCard";
import Link from "next/link";
import { ScuteApp } from "@/types";

const apps:ScuteApp[] = [
  {
    id: 'adfdaf4df-fdafda-4314fadf-4efsdfafa',
    name: 'Example app',
    slug: 'example-app',
    origin:'https://example.com'
  }
]

export default function Home() {
  return (
    <Layout
      titleBarContent={
        <Link href="/apps/new">
          <Button>Create new app</Button>
        </Link>
      }
    >
      <Container size="3">
        <Flex direction="column" gap="2">
          {apps.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </Flex>
      </Container>
    </Layout>
  );
}
