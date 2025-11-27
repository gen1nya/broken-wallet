import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverBody,
  PopoverArrow,
  Box,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodePopoverProps {
  value: string;
  children: React.ReactNode;
  label?: string;
}

/**
 * Component that displays a QR code in a popover when hovering over the trigger element.
 * Used for addresses and xpubs throughout the app.
 */
export default function QRCodePopover({ value, children, label }: QRCodePopoverProps) {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  return (
    <Popover trigger="hover" placement="auto" isLazy>
      <PopoverTrigger>
        <Box display="inline-block" cursor="pointer">
          {children}
        </Box>
      </PopoverTrigger>
      <PopoverContent bg={bgColor} borderColor={borderColor} maxW="300px">
        <PopoverArrow bg={bgColor} />
        <PopoverBody>
          <Box textAlign="center" p={2}>
            {label && (
              <Text fontSize="xs" fontWeight="semibold" mb={2} color="gray.500">
                {label}
              </Text>
            )}
            <Box bg="white" p={3} borderRadius="md" display="inline-block">
              <QRCodeSVG
                value={value}
                size={200}
                level="M"
                includeMargin={false}
              />
            </Box>
            <Text fontSize="xs" mt={2} wordBreak="break-all" fontFamily="mono">
              {value}
            </Text>
          </Box>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
