import {
  Flex,
  Container,
  Text,
  IconButton,
  Button,
  Card,
  Badge,
  Kbd,
  TextField,
  Tooltip,
  DropdownMenu,
  Code,
} from "@radix-ui/themes";
import { Layout } from "@/components/shared/Layout";
import { useState, useReducer } from "react";
import styles from "@/styles/Table.module.scss";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  CopyIcon,
  DotsHorizontalIcon,
  EyeOpenIcon,
  MagnifyingGlassIcon,
} from "@radix-ui/react-icons";
import { shortString } from "@/utils/string";
import Link from "next/link";
import { useRouter } from "next/router";
import { ScuteEvent } from "@/types/event";

const exampleData: ScuteEvent[] = [
  {
    user_id: "e240303b-e261-416f-b0af-7d70239125f7",
    email: "t@linsley.com",
    event: 'webauthn.register.initiated',
    created_at: "2021-01-01",
    ip_address: "127.0.0.1",
    user_agent: "Chrome OSX 4.1 blabla"
  },
  {
    user_id: "e240303b-e261-416f-b0af-7d70239125f7",
    email: "t1@linsley.com",
    event: 'webauthn.register.initiated',
    created_at: "2021-01-01",
    ip_address: "127.0.0.1",
    user_agent: "Chrome OSX 4.1 blabla"
  },
];

const columnHelper = createColumnHelper<ScuteEvent>();


const columns = [
  columnHelper.accessor("user_id", {
    cell: (info) => (
      <Flex gap="1">
        <Tooltip content={info.getValue()}>
          <Kbd size="1">{shortString(info.getValue(), 8)}</Kbd>
        </Tooltip>
        <IconButton color="gray" size="1" variant="ghost">
          <CopyIcon />
        </IconButton>
      </Flex>
    ),
    header: () => <span>User ID</span>,
  }),
  columnHelper.accessor("email", {
    header: () => <span>Email</span>,
  }),
  columnHelper.accessor("event", {
    cell: (info) => (<Code size='1'  color='blue' variant='soft' weight='light'>{info.getValue()}</Code>),
    header: () => <span>Action</span>,

  }),
  columnHelper.accessor("created_at", {
    header : () => <span>Created At</span>
  })

];

export default function AppActivities() {
  const [data, setData] = useState(() => [...exampleData]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Layout
      titleBarContent={
        <Flex gap="3" justify="end">
          <TextField.Root>
            <TextField.Slot>
              <MagnifyingGlassIcon height="16" width="16" />
            </TextField.Slot>
            <TextField.Input placeholder="Search users" />
          </TextField.Root>
          <Button variant="outline">Create new user</Button>
          <Button variant="outline" color="gray">
            Import users
          </Button>
        </Flex>
      }
    >
      <Container size="3">
        <table className={styles.table}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className={styles.th}
                  >
                    {header.isPlaceholder ? null : (
                      <div
                        {...{
                          className: header.column.getCanSort()
                            ? "cursor-pointer select-none"
                            : "",
                          onClick: header.column.getToggleSortingHandler(),
                        }}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {{
                          asc: " 🔼",
                          desc: " 🔽",
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className={styles.tbody}>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={styles.tr}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={styles.td}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Container>
    </Layout>
  );
}
