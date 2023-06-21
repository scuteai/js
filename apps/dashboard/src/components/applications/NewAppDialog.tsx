import { PlusCircledIcon, PlusIcon, ShuffleIcon } from "@radix-ui/react-icons";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTrigger,
  Label,
  TextField,
  Flex,
  Card,
} from "@scute/ui";
import Avatar from "boring-avatars";
import { useState } from "react";
import { colors } from "@/utils/colors";

const paletteColors = colors;
export const NewAppDialog = () => {
  const getRandomPaletteIndex = () =>
    Math.floor(Math.random() * paletteColors.length);
  const defaultAvatarColors = paletteColors[493];

  const [state, setState] = useState({
    name: "",
    origin: "",
    callback: "",
    colors: defaultAvatarColors,
  });

  const randomizeColors = () => {
    const newColors = paletteColors[getRandomPaletteIndex()];
    setState({
      ...state,
      colors: newColors,
    });
  };

  const updateState = (name: string, value: string) => {
    setState({
      ...state,
      [name]: value,
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild={true}>
        <Button variant="mint">Create a new app</Button>
      </DialogTrigger>
      <DialogContent css={{ pt: "0" }}>
        <h2>Create new app</h2>

        <Flex css={{ fd: "column", gap: "$1", mb: "$4" }}>
          <Label>Name</Label>
          <Flex css={{ fontSize: "$1", color: "$gray10" }}>
            Give your application a friendly, human-readable name. You can
            always edit this later.
          </Flex>
          <TextField
            placeholder="Name"
            size="3"
            onChange={(e) => updateState("name", e.target.value)}
          />
        </Flex>

        <Flex css={{ fd: "column" }}>
          <Label css={{ pb: "$1" }}>Project avatar</Label>
          <Card>
            <Flex css={{ jc: "space-between", ai: "center" }}>
              <Avatar
                size={60}
                name={state.name}
                variant="beam"
                colors={state.colors}
              />
              <Button onClick={() => randomizeColors()}>
                Randomize colors <ShuffleIcon />
              </Button>
            </Flex>
          </Card>
        </Flex>

        <Flex css={{ fd: "column", gap: "$1", mt: "$4" }}>
          <Label>Origin domain</Label>
          <Flex css={{ fontSize: "$1", color: "$gray10" }}>
            Enter the domain that you will use Scute on. Some examples are
            &#39;https://example.com&#39; or &#39;http://localhost:8080&#39;.
          </Flex>
          <TextField
            placeholder="https://"
            size="3"
            onChange={(e) => updateState("origin", e.target.value)}
          />
        </Flex>

        <Flex css={{ fd: "column", gap: "$1", mt: "$4", mb: "$4" }}>
          <Label>Return path</Label>
          <Flex
            css={{ fontSize: "$1", color: "$gray10" }}
          >{`Enter the location to redirect users to after a successful login or registration. It must be a relative path (like ‘/’ or ‘/dashboard’) for Scute to work properly.`}</Flex>
          <TextField
            placeholder="/profile"
            size="3"
            onChange={(e) => updateState("callback", e.target.value)}
          />
        </Flex>

        <Button
          css={{
            width: "100%",
            ai: "center",
            jc: "space-between",
            fontSize: "20px ",
          }}
          size="3"
          variant="mint"
        >
          Create <PlusCircledIcon />
        </Button>
      </DialogContent>
    </Dialog>
  );
};
